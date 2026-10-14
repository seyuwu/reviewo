import asyncio
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

from aiogram.types import InlineKeyboardMarkup
from cryptography.fernet import Fernet

from bot.handlers.party import send_party_notification
from bot.services.panel import edit_panel
from bot.storage.database import BotStorage


class PartyDeletedNavigationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.storage = BotStorage(str(Path(self.folder.name) / "bot.db"), Fernet.generate_key())
        self.storage.initialize()
        self.storage.save_session(7, "test-access", "test-refresh")
        self.storage.save_panel(7, 7, 101, "party", is_photo=True)
        self.storage.set_choices(7, "panel_hero_file_v2", [{"fileId": "cached-image"}])
        self.bot = SimpleNamespace(edit_message_media=AsyncMock(return_value=SimpleNamespace(photo=[])))
        self.api = SimpleNamespace(user=AsyncMock(return_value={"party": None, "parties": [], "invites": []}))
        self.settings = SimpleNamespace(site_url="")
        self.row = {"telegramUserId": "7", "payload": {"type": "party_updated", "partyId": "deleted-party"}}
        self.keyboard = InlineKeyboardMarkup(inline_keyboard=[])
        self.renderer = patch("bot.services.panel.render_screen", new=AsyncMock(return_value=("Экран", self.keyboard)))
        self.renderer.start()

    async def asyncTearDown(self):
        self.renderer.stop()
        self.storage.close()
        self.folder.cleanup()

    async def navigate(self, screen):
        await edit_panel(self.bot, self.storage, self.api, self.settings, 7, screen,
                         content=(screen, self.keyboard))

    async def test_delayed_delete_notification_does_not_return_account_to_home(self):
        await self.navigate("home")
        await self.navigate("account")
        self.assertTrue(await send_party_notification(self.bot, self.settings, self.storage, self.api, self.row))
        self.assertEqual(self.storage.get_panel(7).screen, "account")

    async def test_navigation_during_deleted_party_lookup_wins(self):
        fetching = asyncio.Event()
        release = asyncio.Event()

        async def delayed_lookup(*args):
            fetching.set()
            await release.wait()
            return {"party": None, "parties": [], "invites": []}

        self.api.user.side_effect = delayed_lookup
        notice = asyncio.create_task(send_party_notification(self.bot, self.settings, self.storage, self.api, self.row))
        try:
            await asyncio.wait_for(fetching.wait(), 2)
            await self.navigate("home")
            await self.navigate("account")
            release.set()
            self.assertTrue(await notice)
            self.assertEqual(self.storage.get_panel(7).screen, "account")
        finally:
            release.set()
            await asyncio.gather(notice, return_exceptions=True)

    async def test_deleted_party_still_closes_the_open_party_screen(self):
        self.assertTrue(await send_party_notification(self.bot, self.settings, self.storage, self.api, self.row))
        self.assertEqual(self.storage.get_panel(7).screen, "home")

    async def test_stale_delete_lookup_cannot_close_a_new_party_opened_after_navigation(self):
        fetching, release = asyncio.Event(), asyncio.Event()
        calls = 0

        async def lookup(*args):
            nonlocal calls
            calls += 1
            if calls == 1:
                fetching.set()
                await release.wait()
                return {"party": None, "parties": []}
            return {"party": {"id":"new-party","kind":"PARTY","memberCount":1}, "parties": []}

        self.api.user.side_effect = lookup
        notice = asyncio.create_task(send_party_notification(self.bot,self.settings,self.storage,self.api,self.row))
        try:
            await asyncio.wait_for(fetching.wait(),2)
            await self.navigate("home")
            await self.navigate("party")
            release.set()
            self.assertTrue(await notice)
            self.assertEqual(self.storage.get_panel(7).screen,"party")
        finally:
            release.set()
            await asyncio.gather(notice,return_exceptions=True)

    async def test_fresh_roster_refresh_preserves_the_open_party_settings(self):
        await self.navigate("party_settings")
        self.api.user.return_value = {"party": {"id":"live-party","kind":"PARTY","memberCount":1}, "parties": []}
        self.assertTrue(await send_party_notification(self.bot,self.settings,self.storage,self.api,self.row))
        self.assertEqual(self.storage.get_panel(7).screen,"party_settings")


if __name__ == "__main__":
    unittest.main()
