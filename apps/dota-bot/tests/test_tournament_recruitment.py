from datetime import datetime, timedelta, timezone
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock
from uuid import UUID

from aiogram.exceptions import TelegramAPIError
from cryptography.fernet import Fernet

from bot.handlers.tournament_recruitment import tournament_recruit_invitation
from bot.services.tournament_participation import save_tournament_context
from bot.services.tournament_recruitment import consume_recruit_invite, deliver_tournament_recruitment_notice, retire_recruit_invites
from bot.storage.database import BotStorage

USER = 7
EVENT = {"id": "12345678-1234-4234-8234-123456789abc", "slug": "cup", "title": "Cup"}
ENTRY = "55555555-5555-4555-8555-555555555555"
NOTICE = "33333333-3333-4333-8333-333333333333"
TOKEN = UUID(NOTICE).hex
KEY = "tournament_recruit_invite:" + TOKEN
BASE = "/dota/tournaments/cup/participation"


class TournamentRecruitmentTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.storage = BotStorage(str(Path(self.folder.name) / "bot.db"), Fernet.generate_key())
        self.storage.initialize()
        self.storage.save_panel(USER, USER, 10, "home")
        self.storage.set_choices(USER, "panel_hero_file_v2", [{"fileId": "cached-photo"}])
        self.context = save_tournament_context(self.storage, USER, EVENT)
        self.expires = (datetime.now(timezone.utc) + timedelta(hours=6)).isoformat()
        self.invite = {"entryId": ENTRY, "tournamentTitle": "Cup", "name": "<Team>", "senderName": "Captain",
                       "roles": ["2", "3"], "expiresAt": self.expires, "status": "RECRUITING"}
        self.api = SimpleNamespace(login_telegram_bot_session=AsyncMock(return_value={"accessToken": "access", "refreshToken": "refresh"}),
            user=AsyncMock(side_effect=self.request), create_web_access_ticket=AsyncMock(return_value="ticket"))
        message = SimpleNamespace(chat=SimpleNamespace(id=USER), message_id=200, photo=[])
        panel = SimpleNamespace(chat=SimpleNamespace(id=USER), message_id=201, photo=[])
        self.bot = SimpleNamespace(send_message=AsyncMock(return_value=message), send_photo=AsyncMock(return_value=panel),
            edit_message_media=AsyncMock(return_value=panel), edit_message_text=AsyncMock(),
            edit_message_reply_markup=AsyncMock(), delete_message=AsyncMock())
        self.settings = SimpleNamespace(site_url="https://site.invalid", main_bot_username="FDPdotabot")
        self.state = SimpleNamespace(clear=AsyncMock())
        self.row = {"id": NOTICE, "telegramUserId": str(USER), "payload": {"type": "tournament_team_invite",
            "tournamentId": EVENT["id"], "entryId": ENTRY, "tournamentSlug": "cup", "tournamentTitle": "Cup", "queueId": "queue", "generation": 3}}

    async def asyncTearDown(self):
        self.storage.close()
        self.folder.cleanup()

    async def request(self, user, method, path, body=None):
        if method == "GET" and path == BASE + "/invites/" + NOTICE:
            return self.invite
        raise AssertionError("Unexpected API request: " + method + " " + path)

    def callback(self, action, message_id=200):
        return SimpleNamespace(data=action + ":" + TOKEN, bot=self.bot, from_user=SimpleNamespace(id=USER), answer=AsyncMock(),
            message=SimpleNamespace(message_id=message_id, chat=SimpleNamespace(id=USER, type="private")))

    async def deliver(self):
        return await deliver_tournament_recruitment_notice(self.bot, self.api, self.settings, self.storage, self.row)

    async def test_notice_saves_actual_deadline_and_uses_view_callback(self):
        self.assertTrue(await self.deliver())
        call = self.bot.send_message.await_args
        self.assertIn("&lt;Team&gt;", call.args[1])
        button = call.kwargs["reply_markup"].inline_keyboard[0][0]
        self.assertEqual(button.callback_data, "tinvite:" + TOKEN)
        self.assertIsNone(button.url)
        saved = self.storage.get_choice(USER, KEY, 0)
        self.assertEqual((saved["expiresAt"], saved["queueId"], saved["generation"]), (self.expires, "queue", 3))
        self.assertTrue(self.storage.is_temporary_message(USER, 200))

    async def test_opening_invite_posts_panel_and_consumes_original(self):
        await self.deliver()
        await tournament_recruit_invitation(self.callback("tinvite"), self.state, self.api, self.settings, self.storage)
        self.bot.send_photo.assert_awaited_once()
        self.bot.delete_message.assert_any_await(USER, 200)
        self.assertTrue(self.storage.get_choice(USER, KEY, 0)["consumed"])
        self.assertFalse(self.storage.is_temporary_message(USER, 200))
        self.assertEqual(self.storage.get_panel(USER).message_id, 201)
        buttons = [button for row in self.bot.send_photo.await_args.kwargs["reply_markup"].inline_keyboard for button in row]
        self.assertEqual(sum(button.callback_data and button.callback_data.startswith("taccept:") for button in buttons if button.callback_data), 2)
        self.assertTrue(all(len(button.callback_data.encode()) <= 64 for button in buttons if button.callback_data))

    async def test_website_callback_consumes_notice_and_uses_fresh_login_ticket(self):
        await self.deliver()
        await tournament_recruit_invitation(self.callback("tinviteweb"), self.state, self.api, self.settings, self.storage)
        self.api.create_web_access_ticket.assert_awaited_once_with(USER)
        self.bot.delete_message.assert_any_await(USER, 200)
        buttons = self.bot.send_photo.await_args.kwargs["reply_markup"].inline_keyboard
        self.assertIn("ticket=ticket", buttons[0][0].url)
        self.assertIn("recruitInvite%3D" + NOTICE, buttons[0][0].url)

    async def test_failed_delete_keeps_retry_and_strips_invite_buttons(self):
        await self.deliver()
        self.bot.delete_message.side_effect = TelegramAPIError(method="deleteMessage", message="offline")
        await consume_recruit_invite(self.bot, self.storage, USER, TOKEN)
        self.assertTrue(self.storage.get_choice(USER, KEY, 0)["consumed"])
        self.assertTrue(self.storage.is_temporary_message(USER, 200))
        self.bot.edit_message_reply_markup.assert_any_await(chat_id=USER, message_id=200, reply_markup=None)

    async def test_consumption_during_send_acknowledgement_cannot_resurrect_notice(self):
        async def acknowledge_send(*args, **kwargs):
            await consume_recruit_invite(self.bot, self.storage, USER, TOKEN)
            return SimpleNamespace(message_id=200)
        self.bot.send_message.side_effect = acknowledge_send
        await self.deliver()
        self.assertTrue(self.storage.get_choice(USER, KEY, 0)["consumed"])
        self.assertIsNone(self.storage.get_choice(USER, KEY, 0)["messageId"])
        self.assertTrue(self.storage.is_temporary_message(USER, 200))

    async def test_consumed_marker_precedes_slow_telegram_delete(self):
        await self.deliver()
        async def slow_delete(*args, **kwargs):
            self.assertTrue(self.storage.get_choice(USER, KEY, 0).get("consumed"))
        self.bot.delete_message.side_effect = slow_delete
        await consume_recruit_invite(self.bot, self.storage, USER, TOKEN)

    async def test_search_generation_change_retires_notice_but_other_tournament_survives(self):
        await self.deliver()
        retire_recruit_invites(self.storage, USER, "f" * 32, {"state": "JOINED"})
        self.assertFalse(self.storage.get_choice(USER, KEY, 0).get("consumed", False))
        retire_recruit_invites(self.storage, USER, self.context["eventHex"], {"state": "WAITING", "queueId": "queue", "queueGeneration": 3})
        self.assertFalse(self.storage.get_choice(USER, KEY, 0).get("consumed", False))
        retire_recruit_invites(self.storage, USER, self.context["eventHex"], {"state": "WAITING", "queueId": "queue", "queueGeneration": 4})
        self.assertTrue(self.storage.get_choice(USER, KEY, 0)["consumed"])
        self.assertIn((USER, USER, 200), self.storage.due_temporary_messages())
