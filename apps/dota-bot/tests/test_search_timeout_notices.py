import asyncio
from datetime import UTC, datetime
from pathlib import Path
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

from cryptography.fernet import Fernet
from aiogram.exceptions import TelegramAPIError, TelegramForbiddenError
from aiogram.methods import SendMessage

from bot.storage.database import BotStorage
from bot.services.search_timeout_notices import (
    queue_solo_timeout, queue_recruit_timeout, deliver_timeout_notice,
    timeout_notice_keyboard, timeout_notice_text,
)
from bot.services.panel import refresh_active_search_panels


class TimeoutNoticeTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.path = str(Path(self.folder.name) / "bot.db")
        self.key = Fernet.generate_key()
        self.storage = BotStorage(self.path, self.key)
        self.storage.initialize()

    def tearDown(self):
        self.storage.close()
        self.folder.cleanup()

    def solo(self, elapsed=1801):
        search = {"mode": "looking", "startedAt": time.time() - elapsed}
        self.storage.set_choices(7, "auto_search", [search])
        return search

    def recruit(self, elapsed=1801):
        search = {"mode": "recruit", "startedAt": time.time() - elapsed, "partySlug": "test-party"}
        self.storage.set_choices(7, "auto_search", [search])
        party = {"slug": "test-party", "isOwner": True, "recruitmentTimedOut": True, "memberCount": 4, "maxMembers": 5, "recruitedRoles": []}
        return search, party

    def test_solo_requires_full_window_real_timeout_and_no_party(self):
        for elapsed, profile, memberships in [
            (1799, {"lfgTimedOut": False}, {}),
            (1801, {"lfgTimedOut": False}, {}),
            (1801, {"lfgTimedOut": True, "looking": True}, {}),
            (1801, {"lfgTimedOut": True}, {"party": {"slug": "found"}}),
            (1801, {"lfgTimedOut": True}, {"parties": [{"slug": "found"}]}),
        ]:
            queue_solo_timeout(self.storage, 7, self.solo(elapsed), profile, memberships)
        self.assertEqual(self.storage.pending_search_timeout_notices(), [])
        queue_solo_timeout(self.storage, 7, self.solo(), {"lfgTimedOut": True}, {})
        self.assertEqual(self.storage.pending_search_timeout_notices()[0]["ordinal"], 1)

    def test_no_stale_or_invalid_search_notice(self):
        for value in [None, "nan", "inf", "bad", time.time() + 10]:
            search = {"mode": "looking", "startedAt": value}
            self.storage.set_choices(7, "auto_search", [search])
            queue_solo_timeout(self.storage, 7, search, {"lfgTimedOut": True}, {})
        old = self.solo()
        self.solo(1)
        queue_solo_timeout(self.storage, 7, old, {"lfgTimedOut": True}, {})
        self.assertEqual(self.storage.pending_search_timeout_notices(), [])

    def test_recruit_only_captain_same_party_incomplete_expired_search(self):
        for override in [
            {"isOwner": False}, {"slug": "other"}, {"recruitmentTimedOut": False},
            {"memberCount": 5}, {"recruitedRoles": ["5"]},
        ]:
            search, party = self.recruit()
            queue_recruit_timeout(self.storage, 7, search, {**party, **override})
        search, party = self.recruit(1799)
        party["recruitmentTimedOut"] = False
        queue_recruit_timeout(self.storage, 7, search, party)
        self.assertEqual(self.storage.pending_search_timeout_notices(), [])
        search, party = self.recruit()
        queue_recruit_timeout(self.storage, 7, search, party)
        self.assertEqual(self.storage.pending_search_timeout_notices()[0]["search_mode"], "recruit")

    def test_shared_limit_deduplication_and_restart(self):
        self.assertTrue(self.storage.queue_search_timeout_notice(7, "event1", "looking"))
        self.assertFalse(self.storage.queue_search_timeout_notice(7, "event1", "looking"))
        self.assertTrue(self.storage.queue_search_timeout_notice(7, "event2", "recruit"))
        self.assertFalse(self.storage.queue_search_timeout_notice(7, "event3", "looking"))
        self.assertEqual([r["ordinal"] for r in self.storage.pending_search_timeout_notices()], [1])
        self.storage.finish_search_timeout_notice(7, 1)
        self.storage.close()
        self.storage = BotStorage(self.path, self.key)
        self.storage.initialize()
        self.assertEqual([r["ordinal"] for r in self.storage.pending_search_timeout_notices()], [2])
        self.storage.finish_search_timeout_notice(7, 2)
        self.assertFalse(self.storage.queue_search_timeout_notice(7, "event4", "recruit"))
        self.assertEqual(self.storage.pending_search_timeout_notices(), [])

    def test_server_timeout_survives_late_local_start_timestamp(self):
        search = self.solo(1795)
        queue_solo_timeout(self.storage, 7, search, {"lfgTimedOut": True}, {})
        self.assertEqual(self.storage.pending_search_timeout_notices()[0]["ordinal"], 1)
        self.storage.finish_search_timeout_notice(7, 1)
        search, party = self.recruit(1795)
        queue_recruit_timeout(self.storage, 7, search, party)
        self.assertEqual(self.storage.pending_search_timeout_notices()[0]["ordinal"], 2)

    def test_keyboard_and_second_text(self):
        keyboard = timeout_notice_keyboard("FDPdotabot")
        self.assertEqual(keyboard.inline_keyboard[0][0].url, "https://t.me/FDPcommunity")
        invite = keyboard.inline_keyboard[1][0].copy_text.text
        self.assertIn("https://t.me/FDPdotabot?start=src_referral_friends", invite)
        self.assertLessEqual(len(invite), 256)
        self.assertIn("разработчик FDP", timeout_notice_text(1, "looking"))
        self.assertIn("полный состав", timeout_notice_text(1, "recruit"))
        self.assertIn("Спасибо", timeout_notice_text(2, "looking"))
        self.assertLess(len(timeout_notice_text(2, "looking")), len(timeout_notice_text(1, "looking")))

    async def test_delivery_and_20_second_cleanup_survive_restart(self):
        self.storage.queue_search_timeout_notice(7, "event", "looking")
        row = self.storage.pending_search_timeout_notices()[0]
        bot = SimpleNamespace(send_message=AsyncMock(return_value=SimpleNamespace(chat=SimpleNamespace(id=7), message_id=99)))
        await deliver_timeout_notice(bot, self.storage, row, "FDPdotabot")
        self.assertEqual(self.storage.pending_search_timeout_notices(), [])
        stored = self.storage._connection().execute("SELECT delete_at FROM temporary_messages").fetchone()
        remaining = (datetime.fromisoformat(stored["delete_at"]) - datetime.now(UTC)).total_seconds()
        self.assertTrue(18 <= remaining <= 20)
        self.storage.close()
        self.storage = BotStorage(self.path, self.key)
        self.storage.initialize()
        self.assertTrue(self.storage.is_temporary_message(7, 99))

    async def test_existing_notification_finishes_before_new_one_is_sent(self):
        self.storage.queue_search_timeout_notice(7, "event", "looking")
        self.storage.add_temporary_message(7, 7, 88, 7)
        row = self.storage.pending_search_timeout_notices()[0]
        bot = SimpleNamespace(send_message=AsyncMock(return_value=SimpleNamespace(chat=SimpleNamespace(id=7), message_id=99)))
        task = asyncio.create_task(deliver_timeout_notice(bot, self.storage, row, "FDPdotabot"))
        await asyncio.sleep(0.01)
        bot.send_message.assert_not_awaited()
        self.storage.remove_temporary_message(7, 88)
        await task
        bot.send_message.assert_awaited_once()

    async def test_transient_failure_retries_blocked_user_does_not(self):
        self.storage.queue_search_timeout_notice(7, "event", "looking")
        row = self.storage.pending_search_timeout_notices()[0]
        method = SendMessage(chat_id=7, text="test")
        with patch("bot.services.search_timeout_notices.send_temporary_notification", new_callable=AsyncMock) as send:
            send.side_effect = TelegramAPIError(method=method, message="temporary failure")
            await deliver_timeout_notice(object(), self.storage, row, "FDPdotabot")
            self.assertEqual(len(self.storage.pending_search_timeout_notices()), 1)
            send.side_effect = TelegramForbiddenError(method=method, message="blocked")
            await deliver_timeout_notice(object(), self.storage, row, "FDPdotabot")
            self.assertEqual(self.storage.pending_search_timeout_notices(), [])

    async def test_recruit_timeout_is_detected_outside_party_screen_without_redrawing_it(self):
        search, party = self.recruit()
        self.storage.save_session(7, "test-access", "test-refresh", None)
        self.storage.save_panel(7, 7, 40, "account", False)
        api = SimpleNamespace(user=AsyncMock(return_value={"party": party}))
        with patch("bot.services.panel.asyncio.sleep", new_callable=AsyncMock, side_effect=asyncio.CancelledError), \
             patch("bot.services.panel.render_screen", new_callable=AsyncMock) as render:
            with self.assertRaises(asyncio.CancelledError):
                await refresh_active_search_panels(object(), api, object(), self.storage)
            render.assert_not_awaited()
        self.assertEqual(self.storage.pending_search_timeout_notices()[0]["search_mode"], "recruit")
        self.assertEqual(self.storage.get_panel(7).screen, "account")
        self.assertIsNone(self.storage.get_choice(7, "auto_search", 0))

    async def test_other_screen_does_not_add_api_calls_before_timeout(self):
        self.recruit(1799)
        self.storage.save_session(7, "test-access", "test-refresh", None)
        self.storage.save_panel(7, 7, 40, "account", False)
        api = SimpleNamespace(user=AsyncMock())
        with patch("bot.services.panel.asyncio.sleep", new_callable=AsyncMock, side_effect=asyncio.CancelledError):
            with self.assertRaises(asyncio.CancelledError):
                await refresh_active_search_panels(object(), api, object(), self.storage)
        api.user.assert_not_awaited()

    async def test_api_wait_cannot_clear_new_search_or_queue_old_timeout(self):
        _, party = self.recruit()
        self.storage.save_session(7, "test-access", "test-refresh", None)
        self.storage.save_panel(7, 7, 40, "account", False)
        async def reply(*args):
            self.recruit(1)
            return {"party": party}
        api = SimpleNamespace(user=AsyncMock(side_effect=reply))
        with patch("bot.services.panel.asyncio.sleep", new_callable=AsyncMock, side_effect=asyncio.CancelledError):
            with self.assertRaises(asyncio.CancelledError):
                await refresh_active_search_panels(object(), api, object(), self.storage)
        self.assertEqual(self.storage.pending_search_timeout_notices(), [])
        self.assertEqual(self.storage.get_choice(7, "auto_search", 0)["mode"], "recruit")
