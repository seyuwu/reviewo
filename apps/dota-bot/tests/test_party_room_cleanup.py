import asyncio
from datetime import UTC, datetime, timedelta
import time
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, Mock

from aiogram.exceptions import TelegramNetworkError, TelegramServerError
from aiogram.methods import DeleteMessages, GetUpdates
from aiogram.types import Update

from bot.services.party_rooms import PartyRooms, RoomCleanupRetry, RoomReviewError
from bot.services.party_room_journal import PartyRoomJournal


class CleanupTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.storage = SimpleNamespace(saved_party_rooms=lambda bot: [], pending_room_messages=lambda bot: [])
        self.pool = PartyRooms(SimpleNamespace(id=12345), object(), SimpleNamespace(party_rooms_enabled=True), self.storage)
        self.room = {"id":"room", "chatId":"-10012345678", "title":"FDP room", "state":"CLOSING", "generation":4,"leaseToken":"lease",
            "data":{"staffIds":["1"],"presentIds":[],"seenIds":[],"possibleIds":[],"evictIds":[],"links":[],"botBannedIds":[]}}
        self.pool.validate_group = AsyncMock(return_value=(None,["1"]))
        self.pool.mutate = AsyncMock(return_value=True)
        self.pool.read = AsyncMock(side_effect=lambda name,*args,**kw: [object()] if name=="get_chat_administrators" else 1)
        self.pool.request = AsyncMock(return_value=[])
        async def report(room,event,**fields):
            if event=="cleanup-fenced": room["data"]["cleanupFenceAt"]=datetime.now(UTC).isoformat()
            return room
        self.pool.report = AsyncMock(side_effect=report)
        self.pool.flush_messages = AsyncMock(return_value=False)

    async def test_close_waits_for_a_fresh_poll_and_deletes_trailing_service_messages(self):
        await self.pool.operate(self.room)
        self.assertTrue(any(call.args[1]=="cleanup-fenced" for call in self.pool.report.await_args_list))
        self.assertFalse(any(call.args[1]=="closed" for call in self.pool.report.await_args_list))
        self.pool.last_poll_started_at = datetime.now(UTC).timestamp()+1
        self.pool.request.return_value=[{"messageId":101,"sentAt":datetime.now(UTC).isoformat()}]
        await self.pool.operate(self.room)
        self.assertFalse(any(call.args[1]=="closed" for call in self.pool.report.await_args_list))
        self.pool.request.return_value=[]
        await self.pool.operate(self.room)
        self.assertTrue(any(call.args[1]=="closed" for call in self.pool.report.await_args_list))
        self.assertEqual(sum(call.args[0]=="set_chat_title" for call in self.pool.mutate.await_args_list),1)

    async def test_message_deletion_timeout_is_retryable_without_manual_review(self):
        self.pool.request.return_value=[{"messageId":101,"sentAt":datetime.now(UTC).isoformat()}]
        self.pool.mutate.side_effect=TelegramNetworkError(method=DeleteMessages(chat_id=-10012345678,message_ids=[101]),message="fixture timeout")
        try:
            await self.pool.delete_batch(self.room)
        except Exception as error:
            self.assertEqual(type(error).__name__,"RoomCleanupRetry")
        else:
            self.fail("A failed deletion must remain pending")
        self.assertEqual(self.pool.request.await_count,1)

    async def test_closed_phase_does_not_run_old_group_mutations_again(self):
        self.room["data"]["cleanupFenceAt"]=(datetime.now(UTC)-timedelta(seconds=5)).isoformat()
        self.pool.last_poll_started_at=datetime.now(UTC).timestamp()
        await self.pool.operate(self.room)
        self.pool.mutate.assert_not_awaited()
        self.pool.report.assert_awaited_once_with(self.room,"closed",pollStartedAt=int(self.pool.last_poll_started_at*1000))

    async def test_waiting_for_poll_does_not_claim_or_revalidate_the_group(self):
        self.room["data"]["cleanupFenceAt"] = datetime.now(UTC).isoformat()
        self.assertFalse(self.pool.operation_ready(self.room))
        await self.pool.operate(self.room)
        self.pool.validate_group.assert_not_awaited()
        self.pool.read.assert_not_awaited()
        self.pool.request.assert_not_awaited()
        self.pool.last_poll_started_at = datetime.now(UTC).timestamp() + 1
        self.assertTrue(self.pool.operation_ready(self.room))

    async def test_worker_retries_repeatable_cleanup_without_requesting_manual_review(self):
        self.pool.settings.room_worker_only=True
        self.pool.by_chat={int(self.room["chatId"]):self.room}
        self.pool.sync_after=time.time()+1000
        self.storage.pending_room_events=Mock(return_value=[])
        self.storage.pending_room_join_queries=Mock(return_value=[])
        self.storage.unresolved_room_invite_chats=Mock(return_value=set())
        self.storage.prune_room_events=Mock()
        self.pool.request.return_value=self.room
        self.pool.operate=AsyncMock(side_effect=RoomCleanupRetry())
        self.pool.release=AsyncMock()
        signalled=asyncio.Event()
        async def report(room,event,**fields): signalled.set()
        self.pool.report=AsyncMock(side_effect=report)
        task=asyncio.create_task(self.pool.worker())
        try:
            await asyncio.wait_for(signalled.wait(),timeout=1)
        finally:
            task.cancel()
            await asyncio.gather(task,return_exceptions=True)
        self.assertEqual(self.pool.report.await_args.args[1],"retry")
        self.assertGreaterEqual(self.pool.report.await_args.kwargs["retrySeconds"],5)
        self.pool.release.assert_awaited()

    async def test_failed_deletion_never_acknowledges_its_ids(self):
        self.pool.request.return_value=[{"messageId":101,"sentAt":datetime.now(UTC).isoformat()}]
        for result in (False, TelegramServerError(method=DeleteMessages(chat_id=-10012345678,message_ids=[101]),message="fixture")):
            self.pool.mutate.side_effect=result if isinstance(result,Exception) else None
            self.pool.mutate.return_value=result
            self.pool.request.reset_mock()
            with self.assertRaises(RoomCleanupRetry): await self.pool.delete_batch(self.room)
            self.assertEqual(self.pool.request.await_count,1)

    async def test_visible_history_requires_a_one_time_baseline_and_then_is_allowed(self):
        self.pool.by_chat={int(self.room["chatId"]):self.room}
        self.room["state"]="ACTIVE"
        chat=SimpleNamespace(type="supergroup",username=None,is_forum=False,has_visible_history=True)
        admin=SimpleNamespace(status="administrator",**{right:True for right in ("can_change_info","can_delete_messages","can_restrict_members","can_invite_users","can_pin_messages")})
        async def read(method,*args,**kwargs):
            if method=="get_chat": return chat
            if method=="get_chat_member": return admin
            return [SimpleNamespace(user=SimpleNamespace(id=1,is_bot=False)),SimpleNamespace(user=SimpleNamespace(id=12345,is_bot=True))]
        self.pool.validate_group=PartyRooms.validate_group.__get__(self.pool)
        self.pool.read=AsyncMock(side_effect=read)
        with self.assertRaises(RoomReviewError) as error: await self.pool.validate_group(int(self.room["chatId"]))
        self.assertEqual(error.exception.code,"history_baseline")
        self.room["data"]["historyBaselineAt"]=datetime.now(UTC).isoformat()
        self.assertEqual((await self.pool.validate_group(int(self.room["chatId"])))[1],["1"])

    async def test_poll_barrier_advances_only_after_updates_are_durable(self):
        self.storage.room_last_observed_at=Mock(return_value=0)
        self.storage.journal_room_updates=Mock()
        self.pool.dispatch_join_queries=Mock()
        journal=PartyRoomJournal(self.pool)
        self.pool.last_poll_started_at=0
        await journal(AsyncMock(return_value=[]),self.pool.bot,GetUpdates())
        self.assertGreater(self.pool.last_poll_started_at,0)
        before=self.pool.last_poll_started_at
        self.storage.journal_room_updates.side_effect=RuntimeError("disk fixture")
        with self.assertRaises(RuntimeError): await journal(AsyncMock(return_value=[]),self.pool.bot,GetUpdates())
        self.assertEqual(self.pool.last_poll_started_at,before)

    async def test_join_leave_and_title_service_messages_are_in_the_cleanup_journal(self):
        self.storage.room_last_observed_at=Mock(return_value=0)
        self.storage.journal_room_updates=Mock()
        self.pool.dispatch_join_queries=Mock()
        self.pool.by_chat={int(self.room["chatId"]):self.room}
        user={"id":11,"is_bot":False,"first_name":"QA"}
        changes=[{"new_chat_title":"New"},{"new_chat_members":[user]},{"left_chat_member":user},{"supergroup_chat_created":True}]
        updates=[Update(update_id=i,message={"message_id":i,"date":datetime.now(UTC),"chat":{"id":int(self.room["chatId"]),"type":"supergroup"},"from_user":user,**change}) for i,change in enumerate(changes,1)]
        await PartyRoomJournal(self.pool)(AsyncMock(return_value=updates),self.pool.bot,GetUpdates())
        batches=self.storage.journal_room_updates.call_args.args[1]
        flags=[batch[1][0]["payload"]["service"] for batch in batches]
        self.assertEqual(flags,[False,False,False,True])

    async def test_ephemeral_messages_do_not_block_the_regular_history_journal(self):
        self.storage.room_last_observed_at=Mock(return_value=0)
        self.storage.journal_room_updates=Mock()
        self.pool.dispatch_join_queries=Mock()
        self.pool.by_chat={int(self.room["chatId"]):self.room}
        update=Update(update_id=1,message={"message_id":0,"ephemeral_message_id":1,"date":datetime.now(UTC),
            "chat":{"id":int(self.room["chatId"]),"type":"supergroup"},"text":"Private helper result"})
        await PartyRoomJournal(self.pool)(AsyncMock(return_value=[update]),self.pool.bot,GetUpdates())
        self.assertEqual(self.storage.journal_room_updates.call_args.args[1],[(1,[])])
