import asyncio
from datetime import UTC, datetime, timedelta
import time
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, Mock

from aiogram.exceptions import TelegramBadRequest, TelegramNetworkError, TelegramServerError
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

    async def test_rotation_failure_does_not_mute_remaining_party_members(self):
        self.room["state"] = "ROTATING"
        self.pool.remove_members = AsyncMock(side_effect=RoomReviewError("Participant removal not confirmed", "participant_removal"))
        with self.assertRaises(RoomReviewError):
            await self.pool.operate(self.room)
        freezes = [call for call in self.pool.mutate.await_args_list
                   if call.args[0] == "set_chat_permissions" and not call.args[2].can_send_messages]
        self.assertEqual(freezes, [], "Rotating invitations must not freeze a live party chat")

    async def test_removal_waits_for_telegram_to_observe_a_confirmed_ban(self):
        self.pool.read.return_value = SimpleNamespace(status="member")
        self.pool.read.side_effect = None
        self.pool.bot.get_chat_member = AsyncMock(side_effect=[SimpleNamespace(status="member"),SimpleNamespace(status="kicked")])
        await self.pool.remove_member(self.room,"22")
        self.assertEqual(self.pool.bot.get_chat_member.await_count,2)
        self.assertTrue(self.pool.report.await_args.kwargs["ownedBan"])

    async def test_absent_members_do_not_need_another_ban_during_rotation(self):
        self.room["state"] = "ROTATING"
        self.pool.read.side_effect = None
        self.pool.read.return_value = SimpleNamespace(status="left")
        self.pool.bot.get_chat_member = AsyncMock(return_value=SimpleNamespace(status="left"))
        await self.pool.remove_member(self.room,"22")
        self.pool.mutate.assert_not_awaited()
        self.assertFalse(self.pool.report.await_args.kwargs["ownedBan"])

    async def test_old_missing_message_ids_can_be_acknowledged_by_telegram(self):
        self.pool.request.return_value = [{"messageId":101,"sentAt":(datetime.now(UTC)-timedelta(days=4)).isoformat()}]
        self.assertTrue(await self.pool.delete_batch(self.room))
        self.assertEqual(self.pool.request.await_count,2)

    async def test_existing_undeletable_old_messages_still_require_manual_cleanup(self):
        self.pool.request.return_value = [{"messageId":101,"sentAt":(datetime.now(UTC)-timedelta(days=4)).isoformat()}]
        self.pool.mutate.side_effect = TelegramBadRequest(method=DeleteMessages(chat_id=int(self.room["chatId"]),message_ids=[101]),message="message can't be deleted")
        with self.assertRaises(RoomReviewError) as error:
            await self.pool.delete_batch(self.room)
        self.assertEqual(error.exception.code,"old_messages")
        self.assertEqual(self.pool.request.await_count,1)

    async def test_member_who_rejoined_is_not_removed_from_an_old_target_list(self):
        self.room["state"]="ROTATING"
        self.room["data"]["evictIds"]=["22"]
        self.pool.request.return_value={"generation":4,"allowed":True,"mayRemove":False}
        self.pool.remove_member=AsyncMock()
        await self.pool.remove_members(self.room)
        self.pool.remove_member.assert_not_awaited()

    async def test_outdated_removal_generation_never_bans_any_player(self):
        from bot.api.client import ApiError
        self.room["data"]["evictIds"]=["22"]
        self.pool.request.return_value={"generation":5,"mayRemove":True}
        with self.assertRaises(ApiError):await self.pool.remove_members(self.room)
        self.pool.mutate.assert_not_awaited()

    async def test_delayed_confirmation_keeps_removal_pending_and_never_requests_manual_review(self):
        self.pool.read.side_effect=None
        self.pool.read.return_value=SimpleNamespace(status="member")
        self.pool.bot.get_chat_member=AsyncMock(return_value=SimpleNamespace(status="member"))
        with self.assertRaises(RoomCleanupRetry):await self.pool.remove_member(self.room,"22")
        self.pool.report.assert_not_awaited()

    async def test_existing_moderator_ban_is_not_claimed_by_the_bot(self):
        self.pool.read.side_effect=None
        self.pool.read.return_value=SimpleNamespace(status="kicked")
        await self.pool.remove_member(self.room,"22")
        self.pool.mutate.assert_not_awaited()
        self.assertFalse(self.pool.report.await_args.kwargs["ownedBan"])

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
