from copy import deepcopy
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock

from cryptography.fernet import Fernet

from bot.handlers import tournament_companies as handlers
from bot.handlers.tournaments import _show_status
from bot.services.tournament_participation import company_menu, save_tournament_context
from bot.storage.database import BotStorage
import test_tournaments as fixtures

USER = fixtures.USER_ID
EVENT = fixtures.EVENT
ENTRY = fixtures.ENTRY_ID
TARGET = fixtures.OTHER_ENTRY_ID
BASE = fixtures.API_ROOT + "/participation/company"
VERSION = "a" * 64


class TournamentCompanyTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.storage = BotStorage(str(Path(self.folder.name) / "bot.db"), Fernet.generate_key())
        self.storage.initialize()
        self.context = save_tournament_context(self.storage, USER, EVENT)
        self.bot = fixtures.IsolatedBot()
        self.state = SimpleNamespace(clear=AsyncMock())
        self.settings = SimpleNamespace(site_url="https://site.invalid", main_bot_username="FDPdotabot")
        self.entry = {"id": ENTRY, "membershipId": "membership", "name": "Friends", "ownRole": "1", "isCaptain": True,
            "canLeave": True, "status": "RECRUITING", "members": [
                {"name": "Captain", "role": "1", "mmr": 0, "confirmed": True},
                {"name": "<Friend>", "role": "2", "mmr": 1000, "confirmed": False}],
            "company": {"rosterVersion": VERSION, "confirmed": False, "selfConfirmed": True, "confirmations": 1, "requests": []}}
        self.api = SimpleNamespace(login_telegram_bot_session=AsyncMock(return_value={"accessToken": "access", "refreshToken": "refresh"}),
            user=AsyncMock(side_effect=self.request))

    async def asyncTearDown(self):
        self.storage.close()
        self.folder.cleanup()

    def result(self):
        return {"state": "JOINED", "tournament": EVENT, "entry": deepcopy(self.entry), "roles": ["1"]}

    async def request(self, user, method, path, body=None):
        if method == "GET" and path == fixtures.API_ROOT + "/participation":
            return self.result()
        if method == "POST" and path == BASE + "/confirm":
            self.entry["company"]["selfConfirmed"] = body["confirmed"]
            return self.result()
        if method == "GET" and path == BASE + "/teams?page=0":
            return {"page": 0, "pageCount": 1, "total": 1, "sourceEntryId": ENTRY, "rosterVersion": VERSION,
                "items": [{"entryId": TARGET, "name": "Target", "memberCount": 1}]}
        if method == "GET" and path == fixtures.API_ROOT:
            return {**EVENT, "entries": [{"id": TARGET, "teamName": "Target", "status": "RECRUITING",
                "members": [{"displayName": "Other", "positionRole": "3", "mmr": 2000}]}]}
        if method == "POST" and path == BASE + "/applications/" + TARGET:
            self.entry["company"]["requests"] = [{"id": "request", "entryId": TARGET, "name": "Target"}]
            return self.result()
        raise AssertionError("Unexpected API request: " + method + " " + path)

    def callback(self, data):
        return SimpleNamespace(data=data, bot=self.bot, from_user=SimpleNamespace(id=USER), answer=AsyncMock(),
            message=SimpleNamespace(message_id=20, chat=SimpleNamespace(id=USER, type="private")))

    async def press(self, data):
        await handlers.company_action(self.callback(data), self.state, self.api, self.settings, self.storage)

    def button(self, prefix):
        return next(button.callback_data for row in self.bot.views[-1][1].inline_keyboard for button in row
            if button.callback_data and button.callback_data.startswith(prefix))

    async def test_company_card_shows_each_member_and_waits_for_every_consent(self):
        text, markup = company_menu(self.storage, USER, self.context, self.result(), self.settings)
        self.assertIn("&lt;Friend&gt;", text)
        self.assertIn("1/2", text)
        buttons = [button for row in markup.inline_keyboard for button in row]
        self.assertFalse(any(button.callback_data and button.callback_data.startswith("tr:company-teams:") for button in buttons))
        self.assertEqual(next(button.copy_text.text for button in buttons if button.copy_text),
            "https://t.me/FDPdotabot?start=te_" + ENTRY.replace("-", ""))

    async def test_confirm_sends_shown_roster_version_after_refreshing_session(self):
        self.entry["company"]["selfConfirmed"] = False
        await _show_status(self.bot, self.api, self.settings, self.storage, USER, USER, self.context, self.result())
        await self.press(self.button("tr:company-confirm:"))
        self.api.login_telegram_bot_session.assert_awaited_once_with(USER)
        self.api.user.assert_any_await(USER, "POST", BASE + "/confirm", {"rosterVersion": VERSION, "confirmed": True})

    async def test_old_confirm_does_not_confirm_a_replacement_company(self):
        self.entry["company"]["selfConfirmed"] = False
        await _show_status(self.bot, self.api, self.settings, self.storage, USER, USER, self.context, self.result())
        data = self.button("tr:company-confirm:")
        self.entry["id"] = TARGET
        await self.press(data)
        self.assertFalse(any(call.args[1] == "POST" for call in self.api.user.await_args_list))
        self.assertIn("Компания изменилась", self.bot.views[-1][0])

    async def test_organizer_applies_once_for_everyone_after_preview(self):
        self.entry["company"]["confirmed"] = True
        await self.press("tr:company-teams:" + self.context["eventHex"])
        await self.press(self.button("tr:company-pick:"))
        self.assertIn("2 игрока", self.bot.views[-1][0])
        await self.press(self.button("tr:company-apply:"))
        posts = [call for call in self.api.user.await_args_list if call.args[1] == "POST"]
        self.assertEqual(len(posts), 1)
        self.api.user.assert_any_await(USER, "POST", BASE + "/applications/" + TARGET, {"rosterVersion": VERSION})
        self.assertIn("Ждём решения команд: 1", self.bot.views[-1][0])

    async def test_roster_change_rejects_old_company_apply_button(self):
        self.entry["company"]["confirmed"] = True
        await self.press("tr:company-teams:" + self.context["eventHex"])
        await self.press(self.button("tr:company-pick:"))
        data = self.button("tr:company-apply:")
        self.entry["company"]["rosterVersion"] = "b" * 64
        await self.press(data)
        self.assertFalse(any(call.args[1] == "POST" for call in self.api.user.await_args_list))
        self.assertIn("Компания изменилась", self.bot.views[-1][0])
