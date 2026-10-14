import asyncio
from copy import deepcopy
from pathlib import Path
import tempfile
from datetime import datetime
import time
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock

from aiogram.exceptions import TelegramAPIError
from aiogram.methods import DeleteMessage
from cryptography.fernet import Fernet

from bot.api.client import ApiError
from bot.handlers import tournament_applications as handlers
from bot.services.tournament_applications import NOTICE_PREFIX, consume_request_notices, deliver_tournament_application_notice
from bot.services.tournament_participation import save_tournament_context, tournament_status_keyboard
from bot.storage.database import BotStorage

USER = 7
EVENT = {"id": "12345678-1234-4234-8234-123456789abc", "slug": "cup", "title": "Cup"}
NOTICE = "33333333-3333-4333-8333-333333333333"
REQUEST = "44444444-4444-4444-8444-444444444444"
ENTRY = "55555555-5555-4555-8555-555555555555"
CAPTAIN = "66666666-6666-4666-8666-666666666666"
BASE = "/dota/tournaments/cup/participation"
INFO = {"tournamentId": EVENT["id"], "tournamentTitle": "Cup", "entryId": ENTRY, "entryName": "Team",
        "requestId": REQUEST, "playerName": "<Player>", "profileSlug": "player", "role": "2", "mmr": 0,
        "telegramUsername": "Player_QA", "requestUpdatedAt": "2026-10-12T12:00:00.000Z", "active": True, "canAccept": True, "canDecline": True,
        "notificationsEnabled": True, "captainUserId": CAPTAIN}


class TournamentApplicationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.storage = BotStorage(str(Path(self.folder.name) / "bot.db"), Fernet.generate_key())
        self.storage.initialize()
        self.storage.save_panel(USER, USER, 10, "home")
        self.storage.set_choices(USER, "panel_hero_file_v2", [{"fileId": "cached-photo"}])
        self.context = save_tournament_context(self.storage, USER, EVENT)
        self.info = deepcopy(INFO)
        self.api = SimpleNamespace(login_telegram_bot_session=AsyncMock(return_value={"accessToken": "access", "refreshToken": "refresh"}),
            user=AsyncMock(side_effect=self.request))
        notice = SimpleNamespace(chat=SimpleNamespace(id=USER), message_id=200, photo=[])
        panel = SimpleNamespace(chat=SimpleNamespace(id=USER), message_id=201, photo=[])
        self.bot = SimpleNamespace(send_message=AsyncMock(return_value=notice), send_photo=AsyncMock(return_value=panel),
            edit_message_media=AsyncMock(return_value=panel), edit_message_text=AsyncMock(),
            edit_message_reply_markup=AsyncMock(), delete_message=AsyncMock())
        self.settings = SimpleNamespace(site_url="https://site.invalid")
        self.state = SimpleNamespace(clear=AsyncMock())
        self.row = {"id": NOTICE, "telegramUserId": str(USER), "payload": {"type": "tournament_application",
            "tournamentId": EVENT["id"], "tournamentSlug": "cup"}}

    async def asyncTearDown(self):
        self.storage.close()
        self.folder.cleanup()

    async def request(self, user_id, method, path, body=None):
        if method == "GET" and path == BASE + "/applications":
            return {"entryId": ENTRY, "entryName": "Team", "players": [deepcopy(self.info)], "nextCursor": None,
                    "notificationsEnabled": self.info["notificationsEnabled"]}
        if method == "GET" and path in {BASE + "/applications/" + NOTICE, BASE + "/application-requests/" + REQUEST}:
            return deepcopy(self.info)
        if method == "POST" and path.endswith("/decision"):
            return {"ok": True, "decision": body["decision"], "playerName": "<Player>", "entryName": "Team"}
        if method == "POST" and path == BASE + "/application-notifications":
            self.info["notificationsEnabled"] = body["enabled"]
            return {"enabled": body["enabled"], "captainUserId": CAPTAIN}
        raise AssertionError("Unexpected API request: " + method + " " + path)

    def callback(self, data, message_id=10):
        return SimpleNamespace(data=data, bot=self.bot, from_user=SimpleNamespace(id=USER), answer=AsyncMock(),
            message=SimpleNamespace(message_id=message_id, chat=SimpleNamespace(id=USER, type="private")))

    async def press(self, data, message_id=10):
        await handlers.application_action(self.callback(data, message_id), self.state, self.api, self.settings, self.storage)

    def panel_buttons(self):
        call = self.bot.send_photo.await_args if self.bot.send_photo.await_count else self.bot.edit_message_media.await_args
        return [button for row in call.kwargs["reply_markup"].inline_keyboard for button in row]

    async def test_notice_has_profile_and_decision_buttons_and_escaped_player(self):
        self.assertTrue(await deliver_tournament_application_notice(self.bot, self.api, self.settings, self.storage, self.row))
        call = self.bot.send_message.await_args.kwargs
        self.assertIn("&lt;Player&gt;", self.bot.send_message.await_args.args[1])
        self.assertIn("MMR: 0", self.bot.send_message.await_args.args[1])
        buttons = [button for row in call["reply_markup"].inline_keyboard for button in row]
        self.assertEqual([button.text for button in buttons[:3]], ["👤 Посмотреть профиль", "✅ Принять", "❌ Отклонить"])
        self.assertTrue(all(len(button.callback_data.encode()) <= 64 for button in buttons))

    async def test_opening_profile_posts_it_at_bottom_and_removes_original_notice(self):
        await deliver_tournament_application_notice(self.bot, self.api, self.settings, self.storage, self.row)
        await self.press("tap:profile:" + NOTICE.replace("-", ""), 200)
        self.bot.send_photo.assert_awaited_once()
        self.assertIn("&lt;Player&gt;", self.bot.send_photo.await_args.kwargs["caption"])
        self.bot.delete_message.assert_any_await(USER, 200)
        self.assertIsNone(self.storage.get_choice(USER, NOTICE_PREFIX + NOTICE.replace("-", ""), 0))
        accept = next(button for button in self.panel_buttons() if button.text == "✅ Принять")
        await self.press(accept.callback_data, 201)
        self.api.user.assert_any_await(USER, "POST", BASE + "/application-requests/" + REQUEST + "/decision",
            {"decision": "ACCEPT", "requestUpdatedAt": INFO["requestUpdatedAt"], "positionRole": "2"})

    async def test_captain_menu_and_list_open_profiles_and_consume_matching_notices(self):
        keyboard = tournament_status_keyboard({"state": "JOINED", "tournament": EVENT, "entry": {"id": ENTRY, "isCaptain": True, "members": []}}, self.context, self.settings)
        self.assertTrue(any(button.callback_data == "tr:requests:" + self.context["eventHex"]
                            for row in keyboard.inline_keyboard for button in row))
        await deliver_tournament_application_notice(self.bot, self.api, self.settings, self.storage, self.row)
        await self.press("tr:requests:" + self.context["eventHex"])
        player = next(button for button in self.panel_buttons() if button.callback_data.startswith("ta:player:"))
        await self.press(player.callback_data)
        self.bot.delete_message.assert_any_await(USER, 200)
        self.assertTrue(any(button.text == "Полный профиль" for button in self.panel_buttons()))

    async def test_stale_notice_is_suppressed_and_api_failure_does_not_delete_valid_notice(self):
        self.info["active"] = False
        self.assertTrue(await deliver_tournament_application_notice(self.bot, self.api, self.settings, self.storage, self.row))
        self.bot.send_message.assert_not_awaited()
        self.info["active"] = True
        await deliver_tournament_application_notice(self.bot, self.api, self.settings, self.storage, self.row)
        self.api.user.side_effect = ApiError("Temporary API failure", 503)
        await self.press("tap:profile:" + NOTICE.replace("-", ""), 200)
        self.bot.delete_message.assert_not_awaited()
        self.assertIsNotNone(self.storage.get_choice(USER, NOTICE_PREFIX + NOTICE.replace("-", ""), 0))

    async def test_notice_consumed_during_send_is_not_resurrected(self):
        entered, released = asyncio.Event(), asyncio.Event()
        result = self.bot.send_message.return_value

        async def send(*args, **kwargs):
            entered.set()
            await released.wait()
            return result

        self.bot.send_message.side_effect = send
        task = asyncio.create_task(deliver_tournament_application_notice(self.bot, self.api, self.settings, self.storage, self.row))
        await entered.wait()
        await consume_request_notices(self.bot, self.storage, USER, REQUEST)
        released.set()
        self.assertTrue(await task)
        self.assertIsNone(self.storage.get_choice(USER, NOTICE_PREFIX + NOTICE.replace("-", ""), 0))
        self.assertTrue(self.storage.is_temporary_message(USER, 200))

    async def test_failed_notice_deletion_is_queued_for_retry(self):
        await deliver_tournament_application_notice(self.bot, self.api, self.settings, self.storage, self.row)
        self.bot.delete_message.side_effect = TelegramAPIError(DeleteMessage(chat_id=USER, message_id=200), "offline")
        await self.press("tap:profile:" + NOTICE.replace("-", ""), 200)
        self.assertTrue(self.storage.is_temporary_message(USER, 200))
        self.bot.edit_message_reply_markup.assert_any_await(chat_id=USER, message_id=200, reply_markup=None)

    async def test_mute_replaces_notice_text_and_schedules_deletion_after_fifteen_seconds(self):
        await deliver_tournament_application_notice(self.bot, self.api, self.settings, self.storage, self.row)
        buttons = [button for row in self.bot.send_message.await_args.kwargs["reply_markup"].inline_keyboard for button in row]
        self.assertEqual(buttons[-1].text, "🔕 Отключить уведомления")
        await self.press("tap:mute:" + NOTICE.replace("-", ""), 200)
        self.api.user.assert_any_await(USER, "POST", BASE + "/application-notifications", {"enabled": False})
        self.assertIn("Все заявки можно посмотреть", self.bot.edit_message_text.await_args.args[0])
        self.assertIsNone(self.bot.edit_message_text.await_args.kwargs["reply_markup"])
        ttl = self.storage._connection().execute("SELECT delete_at FROM temporary_messages WHERE chat_id=? AND message_id=?", (USER, 200)).fetchone()[0]
        self.assertAlmostEqual(datetime.fromisoformat(ttl).timestamp() - time.time(), 15, delta=2)
        self.bot.delete_message.assert_not_awaited()
        await self.press("tr:requests:" + self.context["eventHex"])
        self.assertTrue(any(button.text == "🔔 Включить уведомления" for button in self.panel_buttons()))
        await self.press("tr:request-unmute:" + self.context["eventHex"])
        self.api.user.assert_any_await(USER, "POST", BASE + "/application-notifications", {"enabled": True})

    async def test_muted_notifications_do_not_send_but_profile_and_inbox_remain_available(self):
        self.info["notificationsEnabled"] = False
        self.assertTrue(await deliver_tournament_application_notice(self.bot, self.api, self.settings, self.storage, self.row))
        self.bot.send_message.assert_not_awaited()
        await self.press("tr:requests:" + self.context["eventHex"])
        self.assertTrue(any(button.callback_data and button.callback_data.startswith("ta:player:") for button in self.panel_buttons()))

    async def test_company_notice_and_profile_show_everyone_and_accept_once(self):
        self.info["company"] = {"name": "Friends", "count": 2, "members": [
            {"name": "<First>", "role": "1", "mmr": 0}, {"name": "Second", "role": "2", "mmr": 2000}]}
        await deliver_tournament_application_notice(self.bot, self.api, self.settings, self.storage, self.row)
        call = self.bot.send_message.await_args
        self.assertIn("&lt;First&gt;", call.args[1])
        self.assertIn("Second", call.args[1])
        buttons = [button for row in call.kwargs["reply_markup"].inline_keyboard for button in row]
        self.assertEqual(buttons[0].text, "👥 Посмотреть компанию")
        self.assertTrue(any(button.text == "✅ Принять всех" for button in buttons))
        await self.press("tap:profile:" + NOTICE.replace("-", ""), 200)
        self.bot.delete_message.assert_any_await(USER, 200)
        accept = next(button for button in self.panel_buttons() if button.text == "✅ Принять всех")
        await self.press(accept.callback_data, 201)
        self.api.user.assert_any_await(USER, "POST", BASE + "/application-requests/" + REQUEST + "/decision",
            {"decision": "ACCEPT", "requestUpdatedAt": INFO["requestUpdatedAt"], "positionRole": "2"})
        self.assertEqual(sum(call.args[1] == "POST" and call.args[2].endswith("/decision") for call in self.api.user.await_args_list), 1)
