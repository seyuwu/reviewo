import asyncio
from copy import deepcopy
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

from cryptography.fernet import Fernet

from bot.services.panel import edit_panel, party_card_cache_key, refresh_active_search_panels, render_screen
from bot.services.party_search_queue import PartySearchAction, PartySearchQueue
from bot.storage.database import BotStorage


class PartyRosterRefreshTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.storage = BotStorage(str(Path(self.folder.name) / "bot.db"), Fernet.generate_key())
        self.storage.initialize()
        self.storage.save_session(7, "test-access", "test-refresh")
        self.settings = SimpleNamespace(site_url="")
        self.party = {
            "id": "party-id", "slug": "roster-qa", "name": "Roster QA", "kind": "PARTY",
            "maxMembers": 5, "memberCount": 5, "openSlots": 0, "isMember": True,
            "isOwner": True, "canManageParty": True, "recruitedRoles": [],
            "members": [
                {"userId": f"user-{role}", "displayName": f"Player {role}",
                 "positionRole": str(role), "role": "OWNER" if role == 1 else "MEMBER"}
                for role in range(1, 6)
            ],
        }
        self.coordination = self.make_coordination()
        self.api = SimpleNamespace(user=AsyncMock(side_effect=self.request), party_rooms=None)
        self.api.fetch_party_card = AsyncMock(return_value=b"test-image")
        self.bot = SimpleNamespace(
            send_photo=AsyncMock(return_value=SimpleNamespace(
                chat=SimpleNamespace(id=7), message_id=101, photo=[])),
            edit_message_media=AsyncMock(return_value=SimpleNamespace(photo=[])),
            edit_message_caption=AsyncMock(),
            delete_message=AsyncMock(),
        )

    async def asyncTearDown(self):
        self.storage.close()
        self.folder.cleanup()

    def make_coordination(self):
        return {"id": self.party["id"], "slug": self.party["slug"], "maxMembers": 5,
                "members": [{**member, "membershipId": member["userId"] + "-membership",
                             "isSelf": member["role"] == "OWNER", "readyAt": None}
                            for member in self.party["members"]]}

    async def request(self, user_id, method, path, body=None):
        if path == "/social/parties/me":
            return {"party": deepcopy(self.party), "invites": []}
        if path.endswith("/coordination"):
            return deepcopy(self.coordination)
        raise AssertionError(path)

    def leave_last_member(self):
        self.party["members"].pop()
        self.party.update(memberCount=4, openSlots=1)
        self.coordination = self.make_coordination()

    def assert_four_member_panel(self, text, keyboard):
        self.assertNotIn("Player 5", text)
        self.assertIn("Состав: 4/5", text)
        callbacks = [button.callback_data for row in keyboard.inline_keyboard for button in row]
        self.assertIn("party:toggle-search:5", callbacks)
        self.assertIn("party:search-all", callbacks)

    async def test_leave_between_roster_and_coordination_reads_frees_slot(self):
        stale = {"party": deepcopy(self.party), "invites": []}
        self.leave_last_member()
        text, keyboard = await render_screen(self.api, self.storage, self.settings, 7, "party", party_data=stale)
        self.assert_four_member_panel(text, keyboard)

    async def test_roster_image_uses_the_same_fresh_snapshot_as_search_buttons(self):
        stale = {"party": deepcopy(self.party), "invites": []}
        self.leave_last_member()
        original_request = self.request

        async def request(*args):
            if args[2] == "/social/parties/me":
                return deepcopy(stale)
            return await original_request(*args)

        self.api.user.side_effect = request
        await edit_panel(self.bot, self.storage, self.api, self.settings, 7, "party")
        self.assertEqual(self.api.fetch_party_card.await_args.args[2], party_card_cache_key(self.party))
        last = self.bot.send_photo.await_args.kwargs
        self.assert_four_member_panel(last["caption"], last["reply_markup"])

    async def test_find_players_restarts_recruitment_only_for_the_freed_slot(self):
        self.leave_last_member()
        original_request = self.request

        async def request(user_id, method, path, body=None):
            if method == "GET":
                return await original_request(user_id, method, path, body)
            if path == "/dota/profiles/lfg/looking":
                self.party["recruitedRoles"] = body["recruitedRoles"]
                return {}
            raise AssertionError(path)

        self.party["joinMode"] = "OPEN"
        self.api.user.side_effect = request
        wakeup = asyncio.Event()
        queue = PartySearchQueue(self.bot, self.api, self.settings, self.storage, wakeup)
        try:
            screen, remind = await queue._apply_actions(7, [PartySearchAction("all", 7)])
        finally:
            await queue.close()
        self.assertEqual((screen, remind), ("party", True))
        self.assertEqual(self.party["recruitedRoles"], ["5"])
        self.assertEqual(self.storage.get_choice(7, "auto_search", 0)["roles"], ["5"])
        self.assertTrue(wakeup.is_set())

    async def test_slow_full_roster_render_cannot_overwrite_leave_refresh(self):
        fetching = asyncio.Event()
        release = asyncio.Event()

        async def fetch_card(*args):
            if not fetching.is_set():
                fetching.set()
                await release.wait()
            return b"test-image"

        self.api.fetch_party_card.side_effect = fetch_card
        stale_update = asyncio.create_task(edit_panel(self.bot, self.storage, self.api, self.settings, 7, "party"))
        await asyncio.wait_for(fetching.wait(), 2)
        try:
            self.leave_last_member()
            await edit_panel(self.bot, self.storage, self.api, self.settings, 7, "party")
        finally:
            release.set()
            await stale_update
        if self.bot.edit_message_media.await_count:
            last = self.bot.edit_message_media.await_args.kwargs
            self.assert_four_member_panel(last["media"].caption, last["reply_markup"])
        else:
            last = self.bot.send_photo.await_args.kwargs
            self.assert_four_member_panel(last["caption"], last["reply_markup"])

    async def test_old_search_timer_cannot_restore_full_roster_after_leave(self):
        self.storage.save_panel(7, 7, 101, "party", is_photo=True)
        self.storage.set_choices(7, "auto_search", [{"mode": "recruit", "partySlug": self.party["slug"]}])
        rendering = asyncio.Event()
        release = asyncio.Event()
        finished = asyncio.Event()

        async def slow_render(*args, **kwargs):
            result = await render_screen(*args, **kwargs)
            if not rendering.is_set():
                rendering.set()
                await release.wait()
            return result

        async def stop_at_end_of_iteration(delay):
            self.assertEqual(delay, 15)
            finished.set()
            await asyncio.Event().wait()

        with patch("bot.services.panel.render_screen", side_effect=slow_render), \
                patch("bot.services.panel.asyncio.sleep", side_effect=stop_at_end_of_iteration):
            timer = asyncio.create_task(refresh_active_search_panels(self.bot, self.api, self.settings, self.storage))
            try:
                await asyncio.wait_for(rendering.wait(), 2)
                self.leave_last_member()
                await edit_panel(self.bot, self.storage, self.api, self.settings, 7, "party")
                release.set()
                await asyncio.wait_for(finished.wait(), 2)
            finally:
                release.set()
                timer.cancel()
                await asyncio.gather(timer, return_exceptions=True)
        self.bot.edit_message_caption.assert_not_awaited()
        last = self.bot.edit_message_media.await_args.kwargs
        self.assert_four_member_panel(last["media"].caption, last["reply_markup"])


if __name__ == "__main__":
    unittest.main()
