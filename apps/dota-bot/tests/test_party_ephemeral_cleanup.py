import asyncio
from datetime import UTC, datetime, timedelta
from pathlib import Path
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

from aiogram.exceptions import TelegramNetworkError, TelegramRetryAfter, TelegramBadRequest
from cryptography.fernet import Fernet

from bot.services.notifications import cleanup_temporary_messages, cleanup_temporary_ephemeral_messages
from bot.services.party_discord import DeletePartyEphemeralMessage
from bot.storage.database import BotStorage


class PrivateMenuCleanupTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.storage = BotStorage(str(Path(self.directory.name) / "bot.db"), Fernet.generate_key())
        self.storage.initialize()
        self.bot = AsyncMock(return_value=True)
        self.key = (12345, -10012345678, 11, 321)
        self.method = DeletePartyEphemeralMessage(chat_id=self.key[1], receiver_user_id=11, ephemeral_message_id=321)

    def tearDown(self):
        self.storage.close()
        self.directory.cleanup()

    def due(self):
        self.storage.add_temporary_ephemeral_message(*self.key, -1)

    async def test_deadline_survives_restart_and_is_scoped_to_bot_and_recipient(self):
        self.storage.add_temporary_ephemeral_message(*self.key, 120)
        self.storage.add_temporary_ephemeral_message(54321, *self.key[1:], -1)
        self.assertEqual(self.storage.due_temporary_ephemeral_messages(12345), [])
        self.storage.close(); self.storage.initialize()
        later = (datetime.now(UTC) + timedelta(seconds=121)).isoformat()
        with patch("bot.storage.database.timestamp", return_value=later):
            self.assertEqual(self.storage.due_temporary_ephemeral_messages(12345), [self.key[1:]])
        self.assertEqual(self.storage.due_temporary_ephemeral_messages(54321), [self.key[1:]])

    async def test_cleanup_deletes_only_the_receivers_private_message(self):
        self.due()
        await cleanup_temporary_ephemeral_messages(self.bot, self.storage, 12345)
        method = self.bot.await_args.args[0]
        self.assertEqual(method.__api_method__, "deleteEphemeralMessage")
        self.assertEqual((method.chat_id, method.receiver_user_id, method.ephemeral_message_id), self.key[1:])
        self.bot.delete_message.assert_not_awaited()
        self.assertEqual(self.storage.due_temporary_ephemeral_messages(12345), [])

    async def test_network_failure_preserves_timer_for_retry(self):
        self.due()
        self.bot.side_effect = TelegramNetworkError(self.method, "fixture offline")
        await cleanup_temporary_ephemeral_messages(self.bot, self.storage, 12345)
        later = (datetime.now(UTC) + timedelta(seconds=11)).isoformat()
        with patch("bot.storage.database.timestamp", return_value=later):
            self.assertEqual(self.storage.due_temporary_ephemeral_messages(12345), [self.key[1:]])

    async def test_flood_control_does_not_retry_before_telegram_allows_it(self):
        self.due()
        self.bot.side_effect = TelegramRetryAfter(self.method, "fixture flood", retry_after=30)
        await cleanup_temporary_ephemeral_messages(self.bot, self.storage, 12345)
        earlier = (datetime.now(UTC) + timedelta(seconds=20)).isoformat()
        with patch("bot.storage.database.timestamp", return_value=earlier):
            self.assertEqual(self.storage.due_temporary_ephemeral_messages(12345), [])

    async def test_already_absent_private_message_finishes_cleanup(self):
        self.due()
        self.bot.side_effect = TelegramBadRequest(self.method, "message not found")
        await cleanup_temporary_ephemeral_messages(self.bot, self.storage, 12345)
        self.assertEqual(self.storage.due_temporary_ephemeral_messages(12345), [])

    async def test_helper_cleanup_leaves_main_bot_temporary_messages_untouched(self):
        self.due()
        self.storage.add_temporary_message(11, 11, 55, -1)
        with patch("bot.services.notifications.asyncio.sleep", side_effect=asyncio.CancelledError):
            with self.assertRaises(asyncio.CancelledError):
                await cleanup_temporary_messages(self.bot, self.storage, bot_id=12345, ephemeral_only=True)
        self.bot.delete_message.assert_not_awaited()
        self.assertTrue(self.storage.is_temporary_message(11, 55))
