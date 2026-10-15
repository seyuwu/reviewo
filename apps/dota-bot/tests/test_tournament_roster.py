import asyncio
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock

from aiogram.types import InlineKeyboardMarkup
from cryptography.fernet import Fernet

from bot.api.client import ApiError
from bot.handlers import router, tournament_roster as roster
from bot.services.panel import edit_panel_content
from bot.services.tournament_participation import save_tournament_context, tournament_callback
from bot.storage.database import BotStorage
from test_tournaments import IsolatedApi, IsolatedBot, EVENT, ENTRY_ID, USER_ID, API_ROOT

CAPTAIN = "11111111-1111-4111-8111-111111111111"


class RosterApi(IsolatedApi):
    def __init__(self):
        super().__init__()
        self.state = "JOINED"
        self.entry.update(isCaptain=True, status="REGISTERED", canLeave=True,
                          membershipId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
        self.entry["members"] = [{"userId": CAPTAIN if role == "1" else f"{role*8}-{role*4}-4{role*3}-8{role*3}-{role*12}",
            "role": role, "name": "Player " + role, "mmr": 4000} for role in "12345"]
        self.can_manage = True
        self.failure = None
        self.fail_refresh = False

    async def request_user(self, user_id, method, path, body=None):
        root = API_ROOT + "/entries/" + self.entry["id"]
        if self.fail_refresh and method == "GET":
            raise ApiError("refresh offline", 503)
        if method == "GET" and path == "/auth/me":
            return {"id": CAPTAIN}
        if method == "GET" and path == root + "/room":
            return {"entryId": self.entry["id"], "name": self.entry["name"], "isCaptain": self.entry["isCaptain"],
                "canManageRoster": self.can_manage, "phase": "TOURNAMENT", "members": [
                    {"userId": member["userId"], "positionRole": member["role"], "displayName": member["name"]}
                    for member in self.entry["members"]]}
        if method == "DELETE" and path.startswith(root + "/members/"):
            if self.failure:
                raise self.failure
            target = path.rsplit("/", 1)[1]
            self.entry["members"] = [member for member in self.entry["members"] if member["userId"] != target]
            self.entry["status"] = "RECRUITING"
            return {"ok": True}
        return await super().request_user(user_id, method, path, body)


class TournamentRosterTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.storage = BotStorage(str(Path(self.folder.name) / "bot.db"), Fernet.generate_key())
        self.storage.initialize()
        self.storage.save_session(USER_ID, "access", "refresh")
        self.context = save_tournament_context(self.storage, USER_ID, EVENT)
        self.api, self.bot = RosterApi(), IsolatedBot()
        self.settings = SimpleNamespace(site_url="https://site.example", main_bot_username="FDPdotabot")

    async def asyncTearDown(self):
        self.storage.close()
        self.folder.cleanup()

    async def press(self, data=None):
        callback = SimpleNamespace(data=data or tournament_callback("roster", self.context["eventHex"]),
            from_user=SimpleNamespace(id=USER_ID), bot=self.bot, answer=AsyncMock(),
            message=SimpleNamespace(message_id=20, chat=SimpleNamespace(id=USER_ID, type="private")))
        await roster.tournament_roster_action(callback, self.api, self.settings, self.storage)

    def button(self, prefix, text=None):
        return next(button.callback_data for row in self.bot.views[-1][1].inline_keyboard for button in row
                    if (button.callback_data or "").startswith(prefix) and (text is None or text in button.text))

    def writes(self):
        return [call.args for call in self.api.user.await_args_list if call.args[1] == "DELETE"]

    async def confirm(self):
        await self.press()
        await self.press(self.button("tr:roster-pick:", "Player 5"))
        return self.button("tr:roster-remove:")

    async def test_full_captain_roster_has_peer_controls_and_precedes_general_router(self):
        names = [child.name for child in router.sub_routers]
        self.assertLess(names.index("tournament-roster"), names.index("tournaments"))
        await self.press()
        self.assertIn("5/5", self.bot.views[-1][0])
        buttons = [button for row in self.bot.views[-1][1].inline_keyboard for button in row]
        picks = [button for button in buttons if (button.callback_data or "").startswith("tr:roster-pick:")]
        self.assertEqual(len(picks), 4)
        self.assertFalse(any("Player 1" in button.text for button in picks))
        self.assertEqual(self.writes(), [])

    async def test_removal_needs_confirmation_and_reopens_the_fifth_position(self):
        target = self.api.entry["members"][-1]["userId"]
        confirmation = await self.confirm()
        self.assertEqual(self.writes(), [])
        self.assertIn("Убрать игрока", self.bot.views[-1][0])
        await self.press(confirmation)
        self.assertEqual(self.writes(), [(USER_ID, "DELETE", API_ROOT + "/entries/" + ENTRY_ID + "/members/" + target)])
        self.assertIn("4/5", self.bot.views[-1][0])
        self.assertNotIn("Player 5", self.bot.views[-1][0])
        self.assertEqual(self.api.entry["status"], "RECRUITING")
        await self.press(confirmation)
        self.assertEqual(len(self.writes()), 1)

    async def test_member_and_former_captain_cannot_remove_players(self):
        confirmation = await self.confirm()
        self.api.entry["isCaptain"] = False
        await self.press(confirmation)
        self.assertEqual(self.writes(), [])
        await self.press()
        self.assertEqual(self.writes(), [])
        self.assertIn("капитан", self.bot.views[-1][0])

    async def test_self_removal_and_callbacks_from_another_chat_are_rejected(self):
        await self.press()
        choice = self.storage.get_choice(USER_ID, roster._CHOICES, 0)
        choice.update(userId=CAPTAIN, positionRole="1")
        self.storage.set_choices(USER_ID, roster._CHOICES, [choice])
        await self.press(tournament_callback("roster-pick", choice["token"]))
        self.assertEqual(self.writes(), [])
        self.api.user.reset_mock()
        callback = SimpleNamespace(data=tournament_callback("roster", self.context["eventHex"]),
            from_user=SimpleNamespace(id=USER_ID), bot=self.bot, answer=AsyncMock(),
            message=SimpleNamespace(chat=SimpleNamespace(id=-100, type="supergroup")))
        await roster.tournament_roster_action(callback, self.api, self.settings, self.storage)
        self.api.user.assert_not_awaited()

    async def test_simultaneous_confirmation_callbacks_cannot_repeat_the_delete(self):
        confirmation = await self.confirm()
        entered, release = asyncio.Event(), asyncio.Event()
        original = self.api.request_user
        async def delayed_delete(user_id, method, path, body=None):
            if method == "DELETE":
                entered.set()
                await release.wait()
            return await original(user_id, method, path, body)
        self.api.user.side_effect = delayed_delete
        first = asyncio.create_task(self.press(confirmation))
        try:
            await asyncio.wait_for(entered.wait(), 2)
            await self.press(confirmation)
            release.set()
            await first
            self.assertEqual(len(self.writes()), 1)
            self.assertEqual(len(self.api.entry["members"]), 4)
        finally:
            release.set()
            await asyncio.gather(first, return_exceptions=True)

    async def test_changed_team_or_captain_membership_invalidates_confirmation(self):
        for field, value in (("id", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
                             ("membershipId", "cccccccc-cccc-4ccc-8ccc-cccccccccccc")):
            with self.subTest(field=field):
                self.api = RosterApi()
                confirmation = await self.confirm()
                self.api.entry[field] = value
                await self.press(confirmation)
                self.assertEqual(self.writes(), [])

    async def test_a_replacement_on_the_same_position_is_not_removed_by_an_old_button(self):
        confirmation = await self.confirm()
        self.api.entry["members"][-1]["userId"] = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
        await self.press(confirmation)
        self.assertEqual(self.writes(), [])

    async def test_other_roster_changes_and_expiry_require_a_new_confirmation(self):
        confirmation = await self.confirm()
        self.api.entry["members"].pop(2)
        await self.press(confirmation)
        self.assertEqual(self.writes(), [])
        choice = self.storage.get_choice(USER_ID, roster._CHOICES, 0)
        choice["expiresAt"] = 0
        self.storage.set_choices(USER_ID, roster._CHOICES, [choice])
        await self.press(confirmation)
        self.assertEqual(self.writes(), [])

    async def test_closed_roster_has_no_remove_controls_and_rejects_an_old_confirmation(self):
        confirmation = await self.confirm()
        self.api.can_manage = False
        await self.press(confirmation)
        self.assertEqual(self.writes(), [])
        await self.press()
        self.assertFalse(any((button.callback_data or "").startswith("tr:roster-pick:")
            for row in self.bot.views[-1][1].inline_keyboard for button in row))

    async def test_uncertain_delete_is_not_automatically_repeated(self):
        confirmation = await self.confirm()
        self.api.failure = ApiError("offline", 503)
        await self.press(confirmation)
        self.assertEqual(len(self.writes()), 1)
        self.assertIn("Обнови состав", self.bot.views[-1][0])
        self.api.failure = None
        await self.press(confirmation)
        self.assertEqual(len(self.writes()), 1)

    async def test_successful_delete_with_failed_refresh_is_reported_as_saved(self):
        confirmation = await self.confirm()
        original = self.api.request_user
        async def fail_after_write(user_id, method, path, body=None):
            result = await original(user_id, method, path, body)
            if method == "DELETE":
                self.api.fail_refresh = True
            return result
        self.api.user.side_effect = fail_after_write
        await self.press(confirmation)
        self.assertIn("Игрок удалён", self.bot.views[-1][0])
        self.assertEqual(len(self.writes()), 1)

    async def test_navigation_during_confirm_lookup_prevents_a_late_removal(self):
        confirmation = await self.confirm()
        entered, release = asyncio.Event(), asyncio.Event()
        original = self.api.request_user
        async def delayed(user_id, method, path, body=None):
            if path.endswith("/room"):
                entered.set()
                await release.wait()
            return await original(user_id, method, path, body)
        self.api.user.side_effect = delayed
        pending = asyncio.create_task(self.press(confirmation))
        try:
            await asyncio.wait_for(entered.wait(), 2)
            await edit_panel_content(self.bot, self.storage, self.api, self.settings, USER_ID, "account", "Аккаунт",
                                     InlineKeyboardMarkup(inline_keyboard=[]), USER_ID)
            release.set()
            await pending
            self.assertEqual(self.storage.get_panel(USER_ID).screen, "account")
            self.assertEqual(self.writes(), [])
        finally:
            release.set()
            await asyncio.gather(pending, return_exceptions=True)

    async def test_long_html_names_fit_the_caption_and_callback_limits(self):
        self.api.entry["name"] = "<" * 80
        for member in self.api.entry["members"]:
            member["name"] = "<&>" * 40
        await self.press()
        text, markup = self.bot.views[-1]
        self.assertLessEqual(len(text), 1024)
        for row in markup.inline_keyboard:
            for button in row:
                self.assertLessEqual(len((button.callback_data or "").encode()), 64)


if __name__ == "__main__":
    unittest.main()
