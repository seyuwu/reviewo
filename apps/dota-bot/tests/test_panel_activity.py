"""Private panel lifecycle with real SQLite and isolated Telegram transports."""

import asyncio
from datetime import UTC, datetime, timedelta
from pathlib import Path
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

from aiogram.exceptions import TelegramAPIError
from aiogram.methods import SendPhoto
from aiogram.types import CallbackQuery, Chat, InlineKeyboardMarkup, Message, User
from cryptography.fernet import Fernet

from bot.middlewares import RecordPrivateCallbackActivityMiddleware
from bot.services.panel import begin_panel_transition, edit_panel_content, refresh_active_search_panels
from bot.services.party_search_queue import PartySearchQueue
from bot.services.panel_activity import (
    PANEL_BIRTH_KEY, PANEL_REPOST_SECONDS, panel_repost_due, private_panel_interaction,
)
from bot.storage.database import BotStorage

USER_ID = 7


class PanelActivityTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.path = str(Path(self.folder.name) / "bot.db")
        self.key = Fernet.generate_key()
        self.storage = BotStorage(self.path, self.key)
        self.storage.initialize()
        self.storage.save_panel(USER_ID, USER_ID, 10, "home")
        self.storage.set_choices(USER_ID, "panel_hero_file_v2", [{"fileId": "cached-photo"}])
        response = SimpleNamespace(chat=SimpleNamespace(id=USER_ID), message_id=100, photo=[])
        self.bot = SimpleNamespace(send_photo=AsyncMock(return_value=response), send_message=AsyncMock(return_value=response),
            edit_message_media=AsyncMock(return_value=response), edit_message_text=AsyncMock(),
            edit_message_caption=AsyncMock(), edit_message_reply_markup=AsyncMock(), delete_message=AsyncMock())
        self.api = SimpleNamespace()
        self.settings = SimpleNamespace()
        self.keyboard = InlineKeyboardMarkup(inline_keyboard=[])

    async def asyncTearDown(self):
        self.storage.close()
        self.folder.cleanup()

    def age_panel(self, age=PANEL_REPOST_SECONDS + 10):
        self.storage.set_choices(USER_ID, PANEL_BIRTH_KEY, [{"chatId": USER_ID, "messageId": 10, "sentAt": time.time() - age}])

    async def render(self, screen="tournaments:status", text="Requested window"):
        await edit_panel_content(self.bot, self.storage, self.api, self.settings, USER_ID, screen, text, self.keyboard)

    async def test_old_navigation_sends_requested_window_first_and_keeps_old_message(self):
        self.age_panel()
        with private_panel_interaction(USER_ID):
            await begin_panel_transition(self.bot, self.storage, USER_ID)
            await self.render()
        self.bot.edit_message_caption.assert_not_awaited()
        self.bot.send_photo.assert_awaited_once()
        self.assertEqual(self.bot.send_photo.await_args.kwargs["caption"], "Requested window")
        self.bot.edit_message_reply_markup.assert_awaited_once_with(chat_id=USER_ID, message_id=10, reply_markup=None)
        self.bot.delete_message.assert_not_awaited()
        self.assertEqual(self.storage.get_panel(USER_ID).message_id, 100)
        self.assertLess(abs(self.storage.get_choice(USER_ID, PANEL_BIRTH_KEY, 0)["sentAt"] - time.time()), 3)

    async def test_fresh_navigation_edits_without_reposting(self):
        with private_panel_interaction(USER_ID):
            await self.render()
        self.bot.send_photo.assert_not_awaited()
        self.bot.edit_message_media.assert_awaited_once()

    async def test_background_refresh_does_not_move_an_old_menu(self):
        self.age_panel()
        birth = self.storage.get_choice(USER_ID, PANEL_BIRTH_KEY, 0)
        await self.render()
        self.bot.send_photo.assert_not_awaited()
        self.bot.edit_message_media.assert_awaited_once()
        self.assertEqual(self.storage.get_choice(USER_ID, PANEL_BIRTH_KEY, 0), birth)

    async def test_editing_and_restart_do_not_reset_the_original_send_time(self):
        self.age_panel()
        birth = self.storage.get_choice(USER_ID, PANEL_BIRTH_KEY, 0)
        self.storage.save_panel(USER_ID, USER_ID, 10, "tournaments:status")
        self.storage.close()
        self.storage = BotStorage(self.path, self.key)
        self.storage.initialize()
        self.assertEqual(self.storage.get_choice(USER_ID, PANEL_BIRTH_KEY, 0), birth)
        with private_panel_interaction(USER_ID):
            self.assertTrue(panel_repost_due(self.storage, USER_ID))

    async def test_private_callback_recovers_legacy_message_date(self):
        self.storage.set_choices(USER_ID, PANEL_BIRTH_KEY, [])
        callback = CallbackQuery(id="callback", from_user=User(id=USER_ID, is_bot=False, first_name="Player"), chat_instance="test",
            message=Message(message_id=10, date=datetime.now(UTC) - timedelta(days=4), chat=Chat(id=USER_ID, type="private")), data="panel:home")

        async def handler(event, data):
            await self.render()

        await RecordPrivateCallbackActivityMiddleware()(handler, callback, {"storage": self.storage})
        self.bot.send_photo.assert_awaited_once()
        self.assertFalse(panel_repost_due(self.storage, USER_ID))

    async def test_clicking_old_notification_does_not_change_current_panel_birth(self):
        birth = self.storage.get_choice(USER_ID, PANEL_BIRTH_KEY, 0)
        callback = CallbackQuery(id="callback", from_user=User(id=USER_ID, is_bot=False, first_name="Player"), chat_instance="test",
            message=Message(message_id=5, date=datetime.now(UTC) - timedelta(days=4), chat=Chat(id=USER_ID, type="private")), data="panel:home")

        async def handler(event, data):
            await self.render()

        await RecordPrivateCallbackActivityMiddleware()(handler, callback, {"storage": self.storage})
        self.bot.send_photo.assert_not_awaited()
        self.assertEqual(self.storage.get_choice(USER_ID, PANEL_BIRTH_KEY, 0), birth)

    async def test_failed_send_preserves_old_controls_and_retries_on_next_navigation(self):
        self.age_panel()
        self.bot.send_photo.side_effect = TelegramAPIError(SendPhoto(chat_id=USER_ID, photo="photo"), "offline")
        with private_panel_interaction(USER_ID):
            with self.assertRaises(TelegramAPIError):
                await self.render()
            self.assertTrue(panel_repost_due(self.storage, USER_ID))
        self.assertEqual(self.storage.get_panel(USER_ID).message_id, 10)
        self.bot.edit_message_reply_markup.assert_not_awaited()
        self.bot.send_photo.side_effect = None
        with private_panel_interaction(USER_ID):
            await self.render()
        self.assertEqual(self.storage.get_panel(USER_ID).message_id, 100)

    async def test_concurrent_navigation_reposts_only_once(self):
        self.age_panel()
        response = self.bot.send_photo.return_value

        async def send(*args, **kwargs):
            await asyncio.sleep(.01)
            return response

        self.bot.send_photo.side_effect = send

        async def click(text):
            with private_panel_interaction(USER_ID):
                await self.render(text=text)

        await asyncio.gather(click("First requested window"), click("Second requested window"))
        self.bot.send_photo.assert_awaited_once()
        self.bot.edit_message_media.assert_awaited_once()
        self.bot.edit_message_reply_markup.assert_awaited_once()

    async def test_inherited_background_task_cannot_repost_after_callback_returns(self):
        self.age_panel()
        released = asyncio.Event()

        async def worker():
            await released.wait()
            await self.render()

        with private_panel_interaction(USER_ID):
            task = asyncio.create_task(worker())
        released.set()
        await task
        self.bot.send_photo.assert_not_awaited()

    async def test_exact_three_day_boundary_and_corrupt_birth(self):
        birth = self.storage.get_choice(USER_ID, PANEL_BIRTH_KEY, 0)["sentAt"]
        with private_panel_interaction(USER_ID):
            with patch("bot.services.panel_activity.time.time", return_value=birth + PANEL_REPOST_SECONDS - 1):
                self.assertFalse(panel_repost_due(self.storage, USER_ID))
            with patch("bot.services.panel_activity.time.time", return_value=birth + PANEL_REPOST_SECONDS):
                self.assertTrue(panel_repost_due(self.storage, USER_ID))
            self.storage.set_choices(USER_ID, PANEL_BIRTH_KEY, [{"chatId": USER_ID, "messageId": 10, "sentAt": "nan"}])
            self.assertFalse(panel_repost_due(self.storage, USER_ID))

    async def test_another_users_interaction_does_not_trigger_repost(self):
        self.age_panel()
        with private_panel_interaction(8):
            await self.render()
        self.bot.send_photo.assert_not_awaited()

    async def test_failed_old_keyboard_cleanup_keeps_the_new_panel(self):
        self.age_panel()
        self.bot.edit_message_reply_markup.side_effect = TelegramAPIError(SendPhoto(chat_id=USER_ID, photo="photo"), "offline")
        with private_panel_interaction(USER_ID):
            await self.render()
        self.assertEqual(self.storage.get_panel(USER_ID).message_id, 100)
        self.bot.delete_message.assert_not_awaited()

    async def test_background_edit_in_flight_cannot_restore_old_panel_after_repost(self):
        self.age_panel()
        entered = asyncio.Event()
        released = asyncio.Event()
        response = self.bot.edit_message_media.return_value

        async def edit(*args, **kwargs):
            entered.set()
            await released.wait()
            return response

        self.bot.edit_message_media.side_effect = edit
        background = asyncio.create_task(self.render(text="Background"))
        await entered.wait()

        async def click():
            with private_panel_interaction(USER_ID):
                await self.render(text="Requested window")

        navigation = asyncio.create_task(click())
        released.set()
        await asyncio.gather(background, navigation)
        self.assertEqual(self.storage.get_panel(USER_ID).message_id, 100)
        self.assertEqual(self.bot.send_photo.await_args.kwargs["caption"], "Requested window")

    async def test_countdown_worker_skips_stale_panel_after_repost(self):
        self.storage.save_session(USER_ID, "access", "refresh")
        self.storage.save_panel(USER_ID, USER_ID, 10, "looking")
        self.storage.set_choices(USER_ID, "auto_search", [{"mode": "looking"}])
        self.age_panel()
        send_entered = asyncio.Event()
        rendered = asyncio.Event()
        released = asyncio.Event()
        response = self.bot.send_photo.return_value

        async def send(*args, **kwargs):
            send_entered.set()
            await released.wait()
            return response

        async def render(*args, **kwargs):
            rendered.set()
            return "Countdown", self.keyboard

        self.bot.send_photo.side_effect = send
        api = SimpleNamespace(user=AsyncMock(return_value={"looking": True}))

        async def click():
            with private_panel_interaction(USER_ID):
                await self.render()

        with patch("bot.services.panel.render_screen", side_effect=render), patch("bot.services.panel.asyncio.sleep", side_effect=asyncio.CancelledError):
            navigation = asyncio.create_task(click())
            await send_entered.wait()
            worker = asyncio.create_task(refresh_active_search_panels(self.bot, api, self.settings, self.storage))
            await rendered.wait()
            released.set()
            await navigation
            with self.assertRaises(asyncio.CancelledError):
                await worker
        self.bot.edit_message_caption.assert_not_awaited()
        self.assertEqual(self.storage.get_panel(USER_ID).message_id, 100)

    async def test_queued_search_does_not_reactivate_replaced_menu_buttons(self):
        self.storage.save_panel(USER_ID, USER_ID, 100, "party")
        queue = PartySearchQueue(self.bot, self.api, self.settings, self.storage, asyncio.Event())
        await queue._update_panel_immediately(USER_ID, USER_ID, 10, self.keyboard, "all", None)
        self.bot.edit_message_reply_markup.assert_not_awaited()
