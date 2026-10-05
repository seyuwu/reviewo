import asyncio
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
import sqlite3
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

from aiogram.fsm.context import FSMContext
from aiogram.fsm.storage.base import StorageKey
from aiogram.fsm.storage.memory import MemoryStorage
from cryptography.fernet import Fernet

from bot.handlers.admin import (
    BroadcastDraft, admin_action, dismiss_legacy_news_button,
    receive_broadcast_text, receive_broadcast_duration,
)
from bot.services.broadcast_duration import (
    DEFAULT_BROADCAST_TTL_SECONDS, MAX_BROADCAST_TTL_SECONDS,
    format_broadcast_duration, parse_broadcast_duration,
)
from bot.services.broadcasts import broadcast_worker
from bot.services.notifications import cleanup_temporary_messages
from bot.storage.database import BotStorage


class DurationTests(unittest.TestCase):
    def test_custom_units_and_plain_minutes(self):
        for text, expected in (("30 сек", 30), ("10", 600), ("2 ч", 7200), ("1 день", 86400), ("47h", MAX_BROADCAST_TTL_SECONDS)):
            self.assertEqual(parse_broadcast_duration(text), expected)
        self.assertEqual(format_broadcast_duration(3600), "1 ч")

    def test_invalid_and_telegram_limit(self):
        for text in ("0", "-1", "48 ч", "2 дня", "abc", "1.5 ч", "999999999999", "10 weeks"):
            with self.assertRaises(ValueError):
                parse_broadcast_duration(text)


class BroadcastStorageTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.path = str(Path(self.directory.name) / "bot.db")
        self.key = Fernet.generate_key()
        self.storage = BotStorage(self.path, self.key)
        self.storage.initialize()

    def tearDown(self):
        self.storage.close()
        self.directory.cleanup()

    def test_all_known_unblocked_users_receive_broadcasts(self):
        for user_id in (7, 8, 9):
            self.storage.record_bot_user(user_id)
        self.storage._connection().execute("UPDATE bot_users SET announcements_enabled = 0 WHERE telegram_user_id = 8")
        self.storage.mark_bot_user_blocked(9)
        self.assertEqual(self.storage.bot_user_stats()["subscribers"], 2)
        self.assertTrue(self.storage.can_receive_broadcast(8))
        self.assertFalse(self.storage.can_receive_broadcast(9))
        campaign, count = self.storage.create_broadcast(7, "test", 600)
        self.assertEqual(count, 2)
        self.assertEqual(self.storage.next_broadcast_recipient()["delete_after_seconds"], 600)
        self.storage.mark_broadcast_recipient(campaign, 7, "sent", sent_message=(7, 101))
        self.assertEqual(self.storage.next_broadcast_recipient()["telegram_user_id"], 8)

    def test_deletion_deadlines_are_per_delivery_and_survive_restart(self):
        for user_id in (7, 8):
            self.storage.record_bot_user(user_id)
        campaign, _ = self.storage.create_broadcast(7, "test", 600)
        first = datetime.now(UTC)
        with patch("bot.storage.database.datetime") as clock:
            clock.now.return_value = first
            self.storage.mark_broadcast_recipient(campaign, 7, "sent", sent_message=(7, 101))
            clock.now.return_value = first + timedelta(seconds=5)
            self.storage.mark_broadcast_recipient(campaign, 8, "sent", sent_message=(8, 102))
        self.storage.close()
        self.storage.initialize()
        self.assertIsNone(self.storage.next_broadcast_recipient())
        self.assertEqual(self.storage.broadcast_summary(campaign)["sent"], 2)
        with patch("bot.storage.database.datetime") as clock:
            clock.now.return_value = first + timedelta(seconds=601)
            self.assertEqual(self.storage.due_temporary_messages(), [(7, 7, 101)])
            clock.now.return_value = first + timedelta(seconds=606)
            self.assertEqual(self.storage.due_temporary_messages(), [(7, 7, 101), (8, 8, 102)])

    def test_existing_queue_migrates_without_losing_session_or_recipients(self):
        self.storage.save_session(7, "access", "refresh")
        self.storage.close()
        connection = sqlite3.connect(self.path)
        connection.execute("DROP TABLE broadcast_campaigns")
        connection.execute("CREATE TABLE broadcast_campaigns (id INTEGER PRIMARY KEY AUTOINCREMENT, admin_user_id INTEGER NOT NULL, text TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, completed_at TEXT)")
        connection.execute("INSERT INTO broadcast_campaigns VALUES (1, 7, 'legacy announcement', 'queued', 'old', NULL)")
        connection.execute("INSERT INTO broadcast_recipients (campaign_id, telegram_user_id) VALUES (1, 7)")
        connection.commit()
        connection.close()
        self.storage.initialize()
        self.assertEqual(self.storage.get_session(7).access_token, "access")
        pending = self.storage.next_broadcast_recipient()
        self.assertEqual(pending["text"], "legacy announcement")
        self.assertEqual(pending["delete_after_seconds"], DEFAULT_BROADCAST_TTL_SECONDS)

    def test_invalid_duration_does_not_create_campaign(self):
        for duration in (0, -1, MAX_BROADCAST_TTL_SECONDS + 1, True):
            with self.assertRaises(ValueError):
                self.storage.create_broadcast(7, "test", duration)
        self.assertIsNone(self.storage.broadcast_summary())


class BroadcastFlowTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.memory = MemoryStorage()
        self.state = FSMContext(self.memory, StorageKey(bot_id=1, chat_id=7, user_id=7))
        self.settings = SimpleNamespace(admin_ids=frozenset({7}))
        self.storage = SimpleNamespace(bot_user_stats=lambda: {"subscribers": 2})
        self.callback = SimpleNamespace(
            data="admin:broadcast:send", from_user=SimpleNamespace(id=7),
            message=SimpleNamespace(chat=SimpleNamespace(id=7, type="private")),
            bot=SimpleNamespace(send_message=AsyncMock(return_value=SimpleNamespace(chat=SimpleNamespace(id=7), message_id=101))),
            answer=AsyncMock(),
        )
        self.message = SimpleNamespace(
            text="test announcement", from_user=SimpleNamespace(id=7),
            chat=SimpleNamespace(id=7, type="private"), bot=self.callback.bot,
        )

    async def asyncTearDown(self):
        await self.memory.close()

    async def test_text_requires_duration_then_custom_duration_shows_preview(self):
        await self.state.set_state(BroadcastDraft.composing)
        with patch("bot.handlers.admin.edit_panel_content", new_callable=AsyncMock) as panel:
            await receive_broadcast_text(self.message, self.state, None, self.settings, self.storage)
            self.assertEqual(await self.state.get_state(), BroadcastDraft.choosing_duration.state)
            await self.state.set_state(BroadcastDraft.custom_duration)
            self.message.text = "30 сек"
            await receive_broadcast_duration(self.message, self.state, None, self.settings, self.storage)
            self.assertEqual(await self.state.get_state(), BroadcastDraft.preview.state)
            self.assertEqual((await self.state.get_data())["broadcast_ttl_seconds"], 30)
            self.assertIn("30 сек", panel.call_args.args[6])

    async def test_confirm_requires_duration_and_double_click_creates_one_campaign(self):
        calls = []
        self.storage.create_broadcast = lambda *args: (calls.append(args) or (1, 2))
        with patch("bot.handlers.admin.acknowledge_callback"), patch("bot.handlers.admin.show_admin_panel", new_callable=AsyncMock):
            await self.state.set_state(BroadcastDraft.preview)
            await self.state.update_data(broadcast_text="test")
            await admin_action(self.callback, self.state, None, self.settings, self.storage)
            self.assertEqual(calls, [])
            await self.state.update_data(broadcast_ttl_seconds=600)
            await asyncio.gather(*(admin_action(self.callback, self.state, None, self.settings, self.storage) for _ in range(2)))
            self.assertEqual(calls, [(7, "test", 600)])

    async def test_non_admin_cannot_send_and_test_uses_selected_duration(self):
        self.callback.from_user.id = 8
        await admin_action(self.callback, self.state, None, self.settings, self.storage)
        self.callback.answer.assert_awaited_once_with("Нет доступа", show_alert=True)
        self.callback.from_user.id = 7
        self.callback.data = "admin:broadcast:test"
        self.storage.add_temporary_message = unittest.mock.Mock()
        await self.state.update_data(broadcast_text="test", broadcast_ttl_seconds=600)
        with patch("bot.handlers.admin.acknowledge_callback"):
            await admin_action(self.callback, self.state, None, self.settings, self.storage)
        self.storage.add_temporary_message.assert_called_once_with(7, 7, 101, 600)

    async def test_legacy_news_button_only_removes_markup(self):
        self.callback.message.edit_reply_markup = AsyncMock()
        with patch("bot.handlers.admin.acknowledge_callback"):
            await dismiss_legacy_news_button(self.callback)
        self.callback.message.edit_reply_markup.assert_awaited_once_with(reply_markup=None)

    async def test_worker_sends_without_unsubscribe_button_and_records_deletion(self):
        recipient = {"campaign_id": 1, "admin_user_id": 7, "telegram_user_id": 8, "text": "test", "delete_after_seconds": 600}
        storage = unittest.mock.Mock()
        storage.next_broadcast_recipient.side_effect = [recipient, None]
        storage.can_receive_broadcast.return_value = True
        storage.mark_broadcast_recipient.return_value = True
        with patch("bot.services.broadcasts._send_completion_report", new_callable=AsyncMock), patch("bot.services.broadcasts.asyncio.sleep", new_callable=AsyncMock, side_effect=[None, asyncio.CancelledError]):
            with self.assertRaises(asyncio.CancelledError):
                await broadcast_worker(self.callback.bot, storage)
        self.callback.bot.send_message.assert_awaited_once_with(8, "test", disable_web_page_preview=True)
        storage.mark_broadcast_recipient.assert_called_once_with(1, 8, "sent", sent_message=(7, 101))

    async def test_cleanup_deletes_due_message_and_keeps_failed_network_deletion(self):
        from aiogram.exceptions import TelegramNetworkError
        from aiogram.methods import DeleteMessage
        bot = SimpleNamespace(delete_message=AsyncMock())
        storage = unittest.mock.Mock()
        storage.due_temporary_messages.return_value = [(8, 8, 101)]
        for failure in (None, TelegramNetworkError(DeleteMessage(chat_id=8, message_id=101), "offline")):
            storage.reset_mock()
            bot.delete_message.side_effect = failure
            with patch("bot.services.notifications.asyncio.sleep", new_callable=AsyncMock, side_effect=asyncio.CancelledError):
                with self.assertRaises(asyncio.CancelledError):
                    await cleanup_temporary_messages(bot, storage)
            if failure is None:
                storage.remove_temporary_message.assert_called_once_with(8, 101)
            else:
                storage.remove_temporary_message.assert_not_called()
