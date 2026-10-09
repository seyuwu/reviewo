import asyncio
from copy import deepcopy
from datetime import UTC, datetime, timedelta
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock

from aiogram.types import User
from aiogram.exceptions import TelegramNetworkError
from aiogram.methods import SendMessage
from cryptography.fernet import Fernet

from bot.api.client import ApiError
from bot.handlers.party import update_party_coordination, view_party_readiness
from bot.services.party_coordination import coordination_context
from bot.services.party_ready import deliver_party_ready_notice, refresh_ready_notice, _links, notice_key
from bot.services.notifications import cleanup_temporary_messages
from bot.storage.database import BotStorage
from bot.ui.keyboards import party_keyboard
from bot.ui.formatters import party_text, telegram_contact_text


class PartyReadinessTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.path = str(Path(self.folder.name) / "bot.db")
        self.key = Fernet.generate_key()
        self.storage = BotStorage(self.path, self.key)
        self.storage.initialize()
        self.counter = 100
        async def send(chat_id, text, **kwargs):
            self.counter += 1
            return SimpleNamespace(chat=SimpleNamespace(id=chat_id), message_id=self.counter)
        self.bot = SimpleNamespace(send_message=AsyncMock(side_effect=send), edit_message_text=AsyncMock(),
                                   edit_message_reply_markup=AsyncMock(), edit_message_media=AsyncMock(),
                                   edit_message_caption=AsyncMock(), delete_message=AsyncMock())
        self.coordination = {
            "id": "party-id", "slug": "qa-party", "name": "QA party", "maxMembers": 5,
            "expiresAt": (datetime.now(UTC) + timedelta(hours=1)).isoformat(),
            "members": [
                {"userId": "alice-id", "membershipId": "alice-membership", "displayName": "Alice", "positionRole": "1", "isSelf": True, "readyAt": None, "telegramUsername": "alice", "telegramContactShared": False, "telegramContactPublic": False},
                {"userId": "bob-id", "membershipId": "bob-membership", "displayName": "Bob", "positionRole": "2", "isSelf": False, "readyAt": None, "telegramUsername": None, "telegramContactShared": False, "telegramContactPublic": False},
            ],
        }
        self.party = {
            "id": "party-id", "slug": "qa-party", "name": "QA party", "maxMembers": 5, "memberCount": 2,
            "openSlots": 3, "isMember": True, "members": [
                {"userId": "alice-id", "displayName": "Alice", "positionRole": "1", "role": "OWNER", "mmr": "4000"},
                {"userId": "bob-id", "displayName": "Bob", "positionRole": "2", "role": "MEMBER", "mmr": "5000"},
            ],
        }
        self.api = SimpleNamespace(user=AsyncMock(side_effect=self.request), create_web_access_ticket=AsyncMock(return_value="T" * 43))
        self.api.fetch_party_card = AsyncMock(side_effect=ApiError("No fixture image", 404))
        self.settings = SimpleNamespace(site_url="https://fdp.example")
        self.cleanup_task = asyncio.create_task(cleanup_temporary_messages(self.bot, self.storage))
        _links.clear()

    async def asyncTearDown(self):
        await asyncio.sleep(0)
        self.cleanup_task.cancel()
        await asyncio.gather(self.cleanup_task, return_exceptions=True)
        _links.clear()
        self.storage.close()
        self.folder.cleanup()

    async def request(self, user_id, method, path, body=None):
        if path.endswith("/coordination"):
            return deepcopy(self.coordination)
        if path.endswith("/ready") or path.endswith("/telegram-contact"):
            if body["membershipId"] != self.coordination["members"][0]["membershipId"]:
                raise ApiError("Stale membership", 409)
            if "ready" in body:
                self.coordination["members"][0]["readyAt"] = datetime.now(UTC).isoformat() if body["ready"] else None
            else:
                self.coordination["members"][0]["telegramContactShared"] = body["visible"]
            return deepcopy(self.coordination)
        if path == "/social/parties/me":
            return {"party": self.party, "parties": [self.party], "invites": []}
        raise AssertionError("Unexpected API path: " + path)

    async def notify(self):
        await deliver_party_ready_notice(self.bot, self.api, self.storage, 7, self.settings.site_url, "qa-party", "Пати найдена!")
        return self.storage.party_ready_notices()[0]

    def callback(self, token, action="ready", toggle="on", user_id=7):
        return SimpleNamespace(
            data=f"party:{action}:{token}:{toggle}", bot=self.bot,
            from_user=User(id=user_id, is_bot=False, first_name="Alice"), answer=AsyncMock(),
            message=SimpleNamespace(chat=SimpleNamespace(id=user_id, type="private")),
        )

    async def test_notification_is_persistent_and_duplicate_events_do_not_send_twice(self):
        notice = await self.notify()
        self.assertTrue(self.storage.is_temporary_message(7, notice["messageId"]))
        self.assertEqual(self.storage.due_temporary_messages(), [])
        await self.notify()
        self.assertEqual(self.bot.send_message.await_count, 1)
        text = self.bot.send_message.await_args.args[1]
        self.assertIn("https://t.me/alice", text)
        self.assertNotIn("https://t.me/bob", text)
        self.assertNotIn("T" * 43, str(self.storage.party_ready_notices()))
        self.assertTrue(self.bot.send_message.await_args.kwargs["protect_content"])

    async def test_confirmation_removes_pending_notice_and_refreshes_roster(self):
        notice = await self.notify()
        # Panel rendering is exercised without a live Telegram transport.
        self.bot.send_photo = AsyncMock(return_value=SimpleNamespace(chat=SimpleNamespace(id=7), message_id=501, photo=[]))
        await update_party_coordination(self.callback(notice["token"]), self.api, self.settings, self.storage)
        self.assertIsNone(self.storage.get_choice(7, notice_key(notice["token"]), 0))
        self.assertIsNotNone(self.coordination["members"][0]["readyAt"])
        mutation = next(call for call in self.api.user.await_args_list if call.args[1] == "POST")
        self.assertEqual(mutation.args[3], {"membershipId": "alice-membership", "ready": True})

    async def test_forwarded_button_cannot_confirm_another_person(self):
        notice = await self.notify()
        before = self.api.user.await_count
        callback = self.callback(notice["token"], user_id=8)
        await update_party_coordination(callback, self.api, self.settings, self.storage)
        self.assertEqual(self.api.user.await_count, before)
        self.assertIsNone(self.coordination["members"][0]["readyAt"])
        callback.answer.assert_awaited_once()

    async def test_peer_readiness_button_is_read_only(self):
        context = coordination_context(self.storage, 7, self.coordination)
        callback = self.callback(context["token"], action="status", toggle="2")
        await view_party_readiness(callback, self.api, self.storage)
        self.assertTrue(all(call.args[1] == "GET" for call in self.api.user.await_args_list))
        self.assertIn("не подтвердил", callback.answer.await_args.args[0])

    async def test_contact_button_changes_only_party_sharing_setting(self):
        notice = await self.notify()
        self.bot.send_photo = AsyncMock(return_value=SimpleNamespace(chat=SimpleNamespace(id=7), message_id=502, photo=[]))
        await update_party_coordination(self.callback(notice["token"], action="contact"), self.api, self.settings, self.storage)
        patch = next(call for call in self.api.user.await_args_list if call.args[1] == "PATCH")
        self.assertEqual(patch.args[3], {"membershipId": "alice-membership", "visible": True})
        self.assertIsNone(self.coordination["members"][0]["readyAt"])

    async def test_reminder_is_sent_once_and_remembered_after_restart(self):
        notice = await self.notify()
        notice["createdAt"] -= 121
        self.storage.set_choices(7, notice_key(notice["token"]), [notice])
        await refresh_ready_notice(self.bot, self.api, self.settings, self.storage, {**notice, "userId": 7})
        self.assertEqual(self.bot.send_message.await_count, 2)
        self.cleanup_task.cancel()
        await asyncio.gather(self.cleanup_task, return_exceptions=True)
        self.storage.close()
        self.storage = BotStorage(self.path, self.key)
        self.storage.initialize()
        self.cleanup_task = asyncio.create_task(cleanup_temporary_messages(self.bot, self.storage))
        _links.clear()
        await refresh_ready_notice(self.bot, self.api, self.settings, self.storage, self.storage.party_ready_notices()[0])
        self.assertEqual(self.bot.send_message.await_count, 2)


    async def test_uncertain_initial_delivery_does_not_duplicate_and_reminder_can_recover(self):
        original_send = self.bot.send_message.side_effect
        self.bot.send_message.side_effect = TelegramNetworkError(method=SendMessage(chat_id=7, text="fixture"), message="transport timeout")
        with self.assertRaises(TelegramNetworkError):
            await self.notify()
        self.bot.send_message.side_effect = original_send
        notice = await self.notify()
        self.assertEqual(self.bot.send_message.await_count, 1)
        self.assertIsNone(notice["messageId"])
        notice["createdAt"] -= 121
        self.storage.set_choices(7, notice_key(notice["token"]), [notice])
        await refresh_ready_notice(self.bot, self.api, self.settings, self.storage, {**notice, "userId": 7})
        self.assertEqual(self.bot.send_message.await_count, 2)

    async def test_expired_or_left_party_drops_notice_without_sending_reminder(self):
        notice = await self.notify()
        self.api.user.side_effect = ApiError("Not a member", 403)
        await refresh_ready_notice(self.bot, self.api, self.settings, self.storage, notice)
        self.assertEqual(self.storage.party_ready_notices(), [])
        self.assertEqual(self.bot.send_message.await_count, 1)

    async def test_old_membership_cannot_mark_rejoined_person_ready(self):
        notice = await self.notify()
        self.coordination["members"][0]["membershipId"] = "new-membership"
        await update_party_coordination(self.callback(notice["token"]), self.api, self.settings, self.storage)
        self.assertIsNone(self.coordination["members"][0]["readyAt"])
        self.assertEqual(self.storage.party_ready_notices(), [])

    async def test_failed_api_confirmation_keeps_notice(self):
        notice = await self.notify()
        self.api.user.side_effect = ApiError("Try later", 503)
        await update_party_coordination(self.callback(notice["token"]), self.api, self.settings, self.storage)
        self.assertTrue(self.storage.party_ready_notices())

    def test_busy_slots_show_readiness_and_empty_slots_keep_search_buttons(self):
        members = [{**member, **extra} for member, extra in zip(self.party["members"], self.coordination["members"])]
        members[1]["readyAt"] = datetime.now(UTC).isoformat()
        party = {**self.party, "members": members, "coordinationAvailable": True, "coordinationToken": "a" * 20}
        keyboard = party_keyboard(party, True, {"3"})
        self.assertEqual([button.text for button in keyboard.inline_keyboard[1]], ["❌", "✅", "Ищем…", "Искать", "Искать"])
        self.assertEqual(keyboard.inline_keyboard[1][1].callback_data, "party:status:" + "a" * 20 + ":2")
        self.assertIn("@alice", party_text(party))

    def test_telegram_tags_are_clickable_and_escape_untrusted_text(self):
        self.assertEqual(telegram_contact_text({"telegramUsername": "bad<script>"}), "")
        self.assertEqual(telegram_contact_text({"telegramUsername": "safe_name"}), '<a href="https://t.me/safe_name">@safe_name</a>')


if __name__ == "__main__":
    unittest.main()
