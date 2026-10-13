import asyncio
from copy import deepcopy
from datetime import UTC, datetime, timedelta
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from aiogram.exceptions import TelegramNetworkError
from aiogram.methods import SendMessage
from cryptography.fernet import Fernet

from bot.api.client import ApiError
from bot.services.party_coordination import coordination_context
from bot.services.party_notice_cleanup import reconcile_party_notice_memberships
from bot.services.party_ready import (
    complete_native_party_notice, deliver_native_party_notice, deliver_party_ready_notice,
    notice_key, refresh_ready_notice,
)
from bot.storage.database import BotStorage
from bot.ui.keyboards import party_keyboard


class NativePartyNoticeTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.storage = BotStorage(str(Path(self.folder.name) / "bot.db"), Fernet.generate_key())
        self.storage.initialize()
        self.user_id = 11
        self.party_id, self.membership = str(uuid4()), str(uuid4())
        self.coordination = {"id": self.party_id, "slug": "native-qa", "name": "QA <party>", "maxMembers": 5,
            "expiresAt": (datetime.now(UTC) + timedelta(hours=1)).isoformat(), "members": [
                {"userId": str(uuid4()), "membershipId": self.membership, "isSelf": True,
                 "displayName": "Alice", "positionRole": "4", "readyAt": None, "telegramUsername": "alice"},
                {"userId": str(uuid4()), "membershipId": str(uuid4()), "isSelf": False,
                 "displayName": "Bob", "positionRole": "2", "readyAt": None}]}
        self.room = {"id": str(uuid4()), "partyId": self.party_id, "membershipId": self.membership,
            "generation": 4, "state": "PREPARING", "inviteLink": None, "inChat": False, "dotaAccountId": None}
        self.counter = 100
        async def send(*args, **kwargs):
            await asyncio.sleep(0)
            self.counter += 1
            return SimpleNamespace(chat=SimpleNamespace(id=self.user_id), message_id=self.counter)
        self.bot = SimpleNamespace(id=12345, send_message=AsyncMock(side_effect=send), edit_message_text=AsyncMock())
        self.settings = SimpleNamespace(main_bot_username="FDPdotabot", site_url="https://qa.invalid")
        self.pool = SimpleNamespace(enabled=True, for_user=AsyncMock(side_effect=lambda *a: deepcopy(self.room)), hint_queue={})
        self.api = SimpleNamespace(storage=self.storage, settings=self.settings, party_rooms=self.pool,
            user=AsyncMock(side_effect=lambda *a: deepcopy(self.coordination)), rooms_request=AsyncMock())

    def tearDown(self):
        self.storage.close()
        self.folder.cleanup()

    async def notify(self, **kwargs):
        await deliver_native_party_notice(self.bot, self.api, self.storage, self.user_id, "native-qa", **kwargs)

    def notice(self):
        rows = self.storage.party_ready_notices()
        return rows[0] if rows else None

    def ready_chat(self):
        self.room.update(state="ACTIVE", inviteLink="https://t.me/+qa")

    def due_ids(self):
        with patch("bot.storage.database.timestamp", return_value=(datetime.now(UTC) + timedelta(seconds=3)).isoformat()):
            return [row[2] for row in self.storage.due_temporary_messages()]

    async def test_preparation_and_ready_update_one_short_notice(self):
        await self.notify()
        initial = self.bot.send_message.await_args
        self.assertIn("Готовим чат", initial.args[1])
        self.assertNotIn("Alice", initial.args[1])
        self.assertNotIn("alice", initial.args[1])
        self.assertIn("QA &lt;party&gt; · 2/5", initial.args[1])
        self.assertIn("Саппорт", initial.args[1])
        self.assertNotIn("Готов играть", str(initial.kwargs["reply_markup"]))
        original = self.notice()["messageId"]
        self.ready_chat()
        await self.notify()
        self.assertEqual(self.bot.send_message.await_count, 1)
        self.assertEqual(self.notice()["messageId"], original)
        self.assertEqual(self.bot.edit_message_text.await_args.kwargs["message_id"], original)
        buttons = self.bot.edit_message_text.await_args.kwargs["reply_markup"].inline_keyboard
        self.assertEqual(buttons[0][0].text, "💬 Войти в чат пати")
        self.assertEqual(buttons[0][0].url, self.room["inviteLink"])

    async def test_fifty_simultaneous_match_and_room_events_send_once(self):
        await asyncio.gather(*[self.notify() if index % 2 else deliver_party_ready_notice(
            self.bot, self.api, self.storage, self.user_id, self.settings.site_url, "native-qa", "old long heading")
            for index in range(50)])
        self.assertEqual(self.bot.send_message.await_count, 1)
        self.assertEqual(len(self.storage.party_ready_notices()), 1)

    async def test_new_roster_edits_existing_notice(self):
        self.ready_chat()
        await self.notify()
        self.coordination["members"].append({"userId": str(uuid4()), "membershipId": str(uuid4()), "isSelf": False})
        await self.notify()
        self.assertEqual(self.bot.send_message.await_count, 1)
        self.assertIn("3/5", self.bot.edit_message_text.await_args.args[0])

    async def test_join_consumes_notice_and_future_roster_events_stay_silent(self):
        self.ready_chat()
        await self.notify()
        message_id = self.notice()["messageId"]
        self.room["inChat"] = True
        await self.notify()
        self.assertIsNone(self.notice())
        self.assertIn(message_id, self.due_ids())
        self.room["inChat"] = False  # Leaving Telegram alone must not resend match-found.
        await self.notify()
        self.assertEqual(self.bot.send_message.await_count, 1)

    async def test_batched_join_check_removes_notice_before_reminder(self):
        self.ready_chat()
        await self.notify()
        self.api.rooms_request.return_value = [{"userId": str(self.user_id), "partyId": self.party_id,
            "membershipId": self.membership, "active": True, "inChat": True}]
        await reconcile_party_notice_memberships(self.bot, self.api, self.storage)
        self.assertIsNone(self.notice())
        await self.notify(allow_reminder=True)
        self.assertEqual(self.bot.send_message.await_count, 1)

    async def test_only_one_reminder_replaces_invitation(self):
        self.ready_chat()
        await self.notify()
        notice = self.notice()
        original = notice["messageId"]
        notice["chatReadyAt"] = 1
        self.storage.set_choices(self.user_id, notice_key(notice["token"]), [notice])
        await refresh_ready_notice(self.bot, self.api, self.settings, self.storage, notice)
        self.assertEqual(self.bot.send_message.await_count, 2)
        self.assertIn("Команда собирается", self.bot.send_message.await_args.args[1])
        self.assertIn(original, self.due_ids())
        await self.notify(allow_reminder=True)
        self.assertEqual(self.bot.send_message.await_count, 2)

    async def test_preparation_does_not_trigger_reminder(self):
        await self.notify()
        notice = self.notice()
        notice["createdAt"] = 1
        self.storage.set_choices(self.user_id, notice_key(notice["token"]), [notice])
        await self.notify(allow_reminder=True)
        self.assertEqual(self.bot.send_message.await_count, 1)

    async def test_missing_id_button_disappears_after_saved_id(self):
        self.ready_chat()
        await self.notify()
        self.assertEqual(len(self.bot.send_message.await_args.kwargs["reply_markup"].inline_keyboard), 2)
        self.room["dotaAccountId"] = "123456789"
        await self.notify()
        self.assertEqual(len(self.bot.edit_message_text.await_args.kwargs["reply_markup"].inline_keyboard), 1)
        self.assertEqual(self.bot.send_message.await_count, 1)

    async def test_existing_legacy_chat_card_is_reused(self):
        self.ready_chat()
        coordination_context(self.storage, self.user_id, self.coordination)
        self.storage.set_choices(self.user_id, "party_room_hint:" + self.party_id, [{
            "partyId": self.party_id, "membershipId": self.membership, "messageId": 55, "chatId": self.user_id}])
        await self.notify()
        self.bot.send_message.assert_not_awaited()
        self.assertEqual(self.notice()["messageId"], 55)
        self.assertIsNone(self.storage.get_choice(self.user_id, "party_room_hint:" + self.party_id, 0))

    async def test_join_during_send_deletes_late_ack_without_resurrection(self):
        async def join_during_send(*a, **kw):
            complete_native_party_notice(self.storage, self.user_id, self.party_id, self.membership)
            return SimpleNamespace(message_id=71)
        self.bot.send_message.side_effect = join_during_send
        await self.notify()
        self.assertIsNone(self.notice())
        self.assertIn(71, self.due_ids())

    async def test_ambiguous_send_is_not_repeated_by_other_worker(self):
        self.bot.send_message.side_effect = TelegramNetworkError(method=SendMessage(chat_id=self.user_id, text="qa"), message="reply lost")
        with self.assertRaises(TelegramNetworkError):
            await self.notify()
        self.bot.send_message.side_effect = None
        await self.notify()
        self.assertEqual(self.bot.send_message.await_count, 1)

    async def test_transient_room_lookup_preserves_existing_invitation(self):
        self.ready_chat()
        await self.notify()
        self.pool.for_user.side_effect = None
        self.pool.for_user.return_value = None
        await self.notify()
        self.bot.edit_message_text.assert_not_awaited()
        self.assertIsNotNone(self.notice())

    async def test_stale_preparation_cannot_remove_working_chat_button(self):
        self.ready_chat()
        await self.notify()
        stale = {**self.room, "state": "PREPARING", "inviteLink": None}
        await self.notify(room=stale)
        self.bot.edit_message_text.assert_not_awaited()

    async def test_new_membership_gets_new_invitation_after_rejoin(self):
        self.room["inChat"] = True
        await self.notify()
        replacement = str(uuid4())
        self.room.update(inChat=False, membershipId=replacement)
        self.coordination["members"][0]["membershipId"] = replacement
        await self.notify()
        self.assertEqual(self.bot.send_message.await_count, 1)
        self.assertEqual(self.notice()["membershipId"], replacement)

    async def test_outsider_or_expired_membership_gets_no_invitation(self):
        self.api.user.side_effect = ApiError("not a member", 403)
        await self.notify()
        self.bot.send_message.assert_not_awaited()

    async def test_captain_alone_gets_no_invitation(self):
        self.coordination["members"] = self.coordination["members"][:1]
        await self.notify()
        self.bot.send_message.assert_not_awaited()

    def test_main_panel_confirms_readiness_only_inside_native_chat(self):
        party = {"id": self.party_id, "slug": "native-qa", "members": self.coordination["members"],
            "coordinationAvailable": True, "coordinationToken": "a" * 20, "telegramRoomEnabled": True,
            "telegramRoomUrl": "https://t.me/+qa", "maxMembers": 5, "memberCount": 2}
        markup = party_keyboard(party, set())
        self.assertFalse(any(button.callback_data and button.callback_data.endswith(":on")
            for row in markup.inline_keyboard for button in row))

