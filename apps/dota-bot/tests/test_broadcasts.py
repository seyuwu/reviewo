import asyncio
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
import sqlite3
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

from aiogram import Bot, Dispatcher, Router
from aiogram.fsm.context import FSMContext
from aiogram.fsm.storage.base import StorageKey
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import Chat, Document, Message, MessageEntity, PhotoSize, Update, User
from cryptography.fernet import Fernet

from bot.handlers.admin import (
    BroadcastDraft, admin_action, dismiss_legacy_news_button, delete_broadcast_notification,
    receive_broadcast_text, receive_broadcast_duration,
    receive_broadcast_photo, router as admin_router,
    show_broadcast_preview, _preview_text,
)
from bot.middlewares import DeletePrivateMessagesMiddleware
from bot.services.broadcast_content import broadcast_preview_pages, normalize_broadcast_entities, validate_broadcast_content
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

    def test_formatting_offsets_must_fit_original_utf16_text(self):
        self.assertEqual(normalize_broadcast_entities("😀x", [{"type": "bold", "offset": 2, "length": 1}])[0]["offset"], 2)
        for entities in ([{"type": "bold", "offset": 2, "length": 2}], [{"type": "bold", "offset": -1, "length": 1}], [{"type": "bold", "offset": 0, "length": 0}], [{"type": "bold"}]):
            with self.subTest(entities=entities), self.assertRaises(ValueError):
                normalize_broadcast_entities("😀x", entities)

    def test_preview_pages_preserve_full_text_and_valid_entity_ranges(self):
        text = "x" * 699 + "😀" + "<&>" * 450
        entities = [{"type": "bold", "offset": 690, "length": 100}, {"type": "text_link", "offset": 701, "length": 900, "url": "https://example.com/"}]
        pages = broadcast_preview_pages(text, entities)
        self.assertEqual("".join(chunk for chunk, _ in pages), text)
        for chunk, formatting in pages:
            self.assertLessEqual(len(chunk.encode("utf-16-le")) // 2, 700)
            normalize_broadcast_entities(chunk, formatting)
            body = _preview_text(text, SimpleNamespace(bot_user_stats=lambda: {"subscribers": 30000}), 169200, True, preview_body=chunk, page_count=len(pages))
            self.assertLessEqual(len(body.encode("utf-16-le")) // 2, 1024)


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

    def test_personal_broadcast_targets_only_selected_user(self):
        for user_id in (7, 8, 9):
            self.storage.record_bot_user(user_id)
        self.storage.mark_bot_user_blocked(9)

        campaign, recipient_count = self.storage.create_broadcast(
            7, "personal", 600, target_telegram_user_id=8
        )

        self.assertEqual(recipient_count, 1)
        recipient = self.storage.next_broadcast_recipient()
        self.assertEqual(recipient["campaign_id"], campaign)
        self.assertEqual(recipient["telegram_user_id"], 8)

    def test_usernames_are_searchable_case_insensitively(self):
        self.storage.record_bot_user(8)
        self.storage.update_bot_user_username(8, "Player_One")

        self.assertEqual(self.storage.find_bot_user("@player_one"), {
            "telegram_user_id": 8,
            "username": "Player_One",
            "blocked": False,
        })

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
        self.assertIsNone(pending["photo_file_id"])
        self.assertEqual(pending["entities"], [])

    def test_photo_queue_and_deletion_survive_restart(self):
        self.storage.record_bot_user(7)
        campaign, _ = self.storage.create_broadcast(7, "caption", 600, photo_file_id="stored-photo")
        self.storage.close()
        self.storage.initialize()
        pending = self.storage.next_broadcast_recipient()
        self.assertEqual((pending["text"], pending["photo_file_id"]), ("caption", "stored-photo"))
        self.storage.mark_broadcast_recipient(campaign, 7, "sent", sent_message=(7, 101))
        self.storage.close()
        self.storage.initialize()
        with patch("bot.storage.database.datetime") as clock:
            clock.now.return_value = datetime.now(UTC) + timedelta(seconds=601)
            self.assertEqual(self.storage.due_temporary_messages(), [(7, 7, 101)])

    def test_invalid_content_does_not_enqueue_and_photo_can_have_no_caption(self):
        for text, photo in (("", None), ("x" * 1025, "photo"), ("❤️" * 513, "photo"), ("x" * 4097, None), ("text", "")):
            with self.subTest(text_length=len(text), photo=photo), self.assertRaises(ValueError):
                self.storage.create_broadcast(7, text, 600, photo_file_id=photo)
        self.assertIsNone(self.storage.broadcast_summary())
        validate_broadcast_content("😀" * 512, "photo")
        self.storage.record_bot_user(7)
        self.storage.create_broadcast(7, "", 600, photo_file_id="photo")
        self.assertEqual(self.storage.next_broadcast_recipient()["text"], "")

    def test_invalid_duration_does_not_create_campaign(self):
        for duration in (0, -1, MAX_BROADCAST_TTL_SECONDS + 1, True):
            with self.assertRaises(ValueError):
                self.storage.create_broadcast(7, "test", duration)
        self.assertIsNone(self.storage.broadcast_summary())


class BroadcastFlowTests(unittest.IsolatedAsyncioTestCase):
    def assert_delete_keyboard(self, markup, callback_data):
        self.assertEqual(len(markup.inline_keyboard), 1)
        self.assertEqual(len(markup.inline_keyboard[0]), 1)
        button = markup.inline_keyboard[0][0]
        self.assertEqual(button.text, "🗑 Удалить это сообщение")
        self.assertEqual(button.callback_data, callback_data)

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
            photo=[SimpleNamespace(file_id="small"), SimpleNamespace(file_id="large")],
            caption="photo caption", media_group_id=None,
        )
        self.callback.bot.send_photo = AsyncMock(return_value=SimpleNamespace(chat=SimpleNamespace(id=7), message_id=102))

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

    async def test_personal_message_confirmation_queues_only_selected_user(self):
        self.storage.can_receive_broadcast = unittest.mock.Mock(return_value=True)
        self.storage.create_broadcast = unittest.mock.Mock(return_value=(4, 1))
        await self.state.set_state(BroadcastDraft.preview)
        await self.state.update_data(
            broadcast_text="private message",
            broadcast_ttl_seconds=600,
            broadcast_target="user",
            broadcast_user_id=42,
            broadcast_username="player",
        )

        with patch("bot.handlers.admin.acknowledge_callback"), patch(
            "bot.handlers.admin.show_admin_panel", new_callable=AsyncMock
        ):
            await admin_action(self.callback, self.state, None, self.settings, self.storage)

        self.storage.create_broadcast.assert_called_once_with(
            7, "private message", 600, target_telegram_user_id=42
        )

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

    async def test_photo_preview_test_and_confirm_use_the_same_media(self):
        self.storage.add_temporary_message = unittest.mock.Mock()
        self.storage.create_broadcast = unittest.mock.Mock(return_value=(1, 2))
        await self.state.set_state(BroadcastDraft.composing)
        with patch("bot.handlers.admin.edit_panel_content", new_callable=AsyncMock) as panel, patch("bot.handlers.admin.acknowledge_callback"), patch("bot.handlers.admin.show_admin_panel", new_callable=AsyncMock):
            await receive_broadcast_photo(self.message, self.state, None, self.settings, self.storage)
            self.assertEqual(await self.state.get_state(), BroadcastDraft.choosing_duration.state)
            self.callback.data = "admin:broadcast:ttl:600"
            await admin_action(self.callback, self.state, None, self.settings, self.storage)
            self.assertEqual(panel.call_args.kwargs["media_photo"], "large")
            self.assertEqual(await self.state.get_state(), BroadcastDraft.preview.state)
            self.callback.data = "admin:broadcast:test"
            await admin_action(self.callback, self.state, None, self.settings, self.storage)
            self.callback.bot.send_photo.assert_awaited_once()
            self.assertEqual(self.callback.bot.send_photo.call_args.args, (7, "large"))
            photo_kwargs = dict(self.callback.bot.send_photo.call_args.kwargs)
            self.assert_delete_keyboard(photo_kwargs.pop("reply_markup"), "broadcast:delete:test")
            self.assertEqual(photo_kwargs, {"caption": "photo caption"})
            self.storage.add_temporary_message.assert_called_once_with(7, 7, 102, 600)
            self.callback.data = "admin:broadcast:send"
            await asyncio.gather(*(admin_action(self.callback, self.state, None, self.settings, self.storage) for _ in range(2)))
            self.storage.create_broadcast.assert_called_once_with(7, "photo caption", 600, photo_file_id="large")

    async def test_photo_replacement_text_edit_and_removal(self):
        await self.state.set_state(BroadcastDraft.preview)
        await self.state.update_data(broadcast_text="original", broadcast_photo_file_id="old-photo", broadcast_ttl_seconds=600)
        with patch("bot.handlers.admin.edit_panel_content", new_callable=AsyncMock), patch("bot.handlers.admin.acknowledge_callback"):
            self.callback.data = "admin:broadcast:photo"
            await admin_action(self.callback, self.state, None, self.settings, self.storage)
            self.message.caption = None
            await receive_broadcast_photo(self.message, self.state, None, self.settings, self.storage)
            data = await self.state.get_data()
            self.assertEqual((data["broadcast_text"], data["broadcast_photo_file_id"]), ("original", "large"))
            self.callback.data = "admin:broadcast:edit"
            await admin_action(self.callback, self.state, None, self.settings, self.storage)
            await receive_broadcast_text(self.message, self.state, None, self.settings, self.storage)
            self.assertEqual((await self.state.get_data())["broadcast_photo_file_id"], "large")
            self.callback.data = "admin:broadcast:photo:remove"
            await admin_action(self.callback, self.state, None, self.settings, self.storage)
            self.assertIsNone((await self.state.get_data())["broadcast_photo_file_id"])
            self.assertEqual(await self.state.get_state(), BroadcastDraft.preview.state)
            await self.state.update_data(broadcast_text="", broadcast_photo_file_id="large")
            await admin_action(self.callback, self.state, None, self.settings, self.storage)
            self.assertEqual(await self.state.get_state(), BroadcastDraft.composing.state)

    async def test_editing_formatted_caption_replaces_entities_and_plain_edit_clears_them(self):
        await self.state.set_state(BroadcastDraft.composing)
        await self.state.update_data(broadcast_photo_file_id="large", broadcast_ttl_seconds=600)
        self.message.text = "  😀 Текст  "
        self.message.entities = [MessageEntity(type="bold", offset=5, length=5)]
        with patch("bot.handlers.admin.edit_panel_content", new_callable=AsyncMock):
            await receive_broadcast_text(self.message, self.state, None, self.settings, self.storage)
            data = await self.state.get_data()
            self.assertEqual(data["broadcast_text"], "  😀 Текст  ")
            self.assertEqual(data["broadcast_entities"][0]["offset"], 5)
            self.message.text = "simple replacement"
            self.message.entities = None
            await self.state.set_state(BroadcastDraft.composing)
            await receive_broadcast_text(self.message, self.state, None, self.settings, self.storage)
            self.assertEqual((await self.state.get_data())["broadcast_entities"], [])
            self.assertEqual((await self.state.get_data())["broadcast_photo_file_id"], "large")

    async def test_formatted_text_and_photo_survive_intake_queue_restart_and_delivery(self):
        text = " 😀 Привет, ссылка\nсекрет "
        entities = [
            MessageEntity(type="bold", offset=4, length=6),
            MessageEntity(type="italic", offset=4, length=6),
            MessageEntity(type="text_link", offset=12, length=6, url="https://example.com/"),
            MessageEntity(type="spoiler", offset=19, length=6),
        ]
        for with_photo in (False, True):
            with self.subTest(with_photo=with_photo), tempfile.TemporaryDirectory() as directory:
                storage = BotStorage(str(Path(directory)/"bot.db"), Fernet.generate_key())
                storage.initialize()
                storage.record_bot_user(7)
                try:
                    await self.state.clear()
                    await self.state.set_state(BroadcastDraft.composing)
                    self.message.text, self.message.entities = text, entities
                    self.message.caption = None
                    self.callback.bot.send_message.reset_mock()
                    self.callback.bot.send_photo.reset_mock()
                    with patch("bot.handlers.admin.edit_panel_content", new_callable=AsyncMock), patch("bot.handlers.admin.acknowledge_callback"), patch("bot.handlers.admin.show_admin_panel", new_callable=AsyncMock):
                        await receive_broadcast_text(self.message, self.state, None, self.settings, storage)
                        self.callback.data = "admin:broadcast:ttl:600"
                        await admin_action(self.callback, self.state, None, self.settings, storage)
                        if with_photo:
                            self.callback.data = "admin:broadcast:photo"
                            await admin_action(self.callback, self.state, None, self.settings, storage)
                            await receive_broadcast_photo(self.message, self.state, None, self.settings, storage)
                        self.callback.data = "admin:broadcast:test"
                        await admin_action(self.callback, self.state, None, self.settings, storage)
                        sender = self.callback.bot.send_photo if with_photo else self.callback.bot.send_message
                        test_kwargs = dict(sender.call_args.kwargs)
                        self.assert_delete_keyboard(test_kwargs.pop("reply_markup"), "broadcast:delete:test")
                        self.callback.data = "admin:broadcast:send"
                        await admin_action(self.callback, self.state, None, self.settings, storage)
                    storage.close()
                    storage.initialize()
                    pending = storage.next_broadcast_recipient()
                    self.assertEqual(pending["text"], text)
                    self.assertEqual(pending["entities"], normalize_broadcast_entities(text, entities))
                    with patch("bot.services.broadcasts._send_completion_report", new_callable=AsyncMock), patch("bot.services.broadcasts.asyncio.sleep", new_callable=AsyncMock, side_effect=[None, asyncio.CancelledError]):
                        with self.assertRaises(asyncio.CancelledError):
                            await broadcast_worker(self.callback.bot, storage)
                    delivered_kwargs = dict(sender.call_args.kwargs)
                    self.assert_delete_keyboard(delivered_kwargs.pop("reply_markup"), f"broadcast:delete:{pending['campaign_id']}")
                    self.assertEqual(delivered_kwargs, test_kwargs)
                    self.assertEqual(sender.call_args.kwargs["caption_entities" if with_photo else "entities"], entities)
                    self.assertIsNone(sender.call_args.kwargs["parse_mode"])
                    self.assertEqual(storage.broadcast_summary()["sent"], 1)
                finally:
                    storage.close()

    async def test_new_photo_caption_replaces_previous_formatting(self):
        await self.state.set_state(BroadcastDraft.choosing_photo)
        await self.state.update_data(broadcast_text="old", broadcast_entities=[{"type": "bold", "offset": 0, "length": 3}], broadcast_ttl_seconds=600)
        self.message.caption = "new caption"
        self.message.caption_entities = [MessageEntity(type="spoiler", offset=4, length=7)]
        with patch("bot.handlers.admin.edit_panel_content", new_callable=AsyncMock):
            await receive_broadcast_photo(self.message, self.state, None, self.settings, self.storage)
        data = await self.state.get_data()
        self.assertEqual(data["broadcast_text"], "new caption")
        self.assertEqual(data["broadcast_entities"], [{"type": "spoiler", "offset": 4, "length": 7}])

    async def test_preview_shows_all_478_characters_and_original_formatting(self):
        text = "Ребята, " + "текст объявления " * 26
        text = text.ljust(478, "!")[:478]
        await self.state.update_data(broadcast_text=text, broadcast_ttl_seconds=60, broadcast_entities=[{"type": "bold", "offset": 0, "length": 6}])
        with patch("bot.handlers.admin.edit_panel_content", new_callable=AsyncMock) as panel:
            await show_broadcast_preview(self.callback.bot, None, self.settings, self.storage, self.state, 7, 7)
        rendered = panel.call_args.args[6]
        self.assertIn("<b>Ребята</b>" + text[6:], rendered)
        self.assertNotIn("…", rendered)
        self.assertNotIn("Страница", rendered)

    async def test_preview_navigation_does_not_shorten_the_queued_message(self):
        text = "a" * 4096
        await self.state.set_state(BroadcastDraft.preview)
        await self.state.update_data(broadcast_text=text, broadcast_ttl_seconds=600)
        self.storage.create_broadcast = unittest.mock.Mock(return_value=(1, 2))
        with patch("bot.handlers.admin.edit_panel_content", new_callable=AsyncMock) as panel, patch("bot.handlers.admin.acknowledge_callback"), patch("bot.handlers.admin.show_admin_panel", new_callable=AsyncMock):
            self.callback.data = "admin:broadcast:page:5"
            await admin_action(self.callback, self.state, None, self.settings, self.storage)
            self.assertIn("Страница 6 из 6", panel.call_args.args[6])
            self.assertIn("a" * 596, panel.call_args.args[6])
            self.callback.data = "admin:broadcast:send"
            await admin_action(self.callback, self.state, None, self.settings, self.storage)
            self.storage.create_broadcast.assert_called_once_with(7, text, 600)

    async def test_invalid_photo_and_non_admin_leave_no_new_draft(self):
        await self.state.set_state(BroadcastDraft.composing)
        await self.state.update_data(broadcast_text="original", broadcast_photo_file_id="old")
        with patch("bot.handlers.admin.edit_panel_content", new_callable=AsyncMock):
            for caption, album in (("x" * 1025, None), ("caption", "album")):
                self.message.caption, self.message.media_group_id = caption, album
                await receive_broadcast_photo(self.message, self.state, None, self.settings, self.storage)
                self.assertEqual((await self.state.get_data())["broadcast_photo_file_id"], "old")
            self.message.from_user.id = 8
            await receive_broadcast_photo(self.message, self.state, None, self.settings, self.storage)
            self.assertEqual(await self.state.get_data(), {})

    async def test_worker_retries_photo_and_schedules_single_deletion(self):
        from aiogram.exceptions import TelegramRetryAfter
        from aiogram.methods import SendPhoto
        recipient = {"campaign_id": 1, "admin_user_id": 7, "telegram_user_id": 8, "text": "caption", "photo_file_id": "large"}
        storage = unittest.mock.Mock()
        storage.next_broadcast_recipient.side_effect = [recipient, recipient, None]
        storage.can_receive_broadcast.return_value = True
        storage.mark_broadcast_recipient.return_value = True
        self.callback.bot.send_photo.side_effect = [
            TelegramRetryAfter(SendPhoto(chat_id=8, photo="large"), "slow down", 1),
            SimpleNamespace(chat=SimpleNamespace(id=8), message_id=102),
        ]
        with patch("bot.services.broadcasts._send_completion_report", new_callable=AsyncMock), patch("bot.services.broadcasts.asyncio.sleep", new_callable=AsyncMock, side_effect=[None, None, asyncio.CancelledError]):
            with self.assertRaises(asyncio.CancelledError):
                await broadcast_worker(self.callback.bot, storage)
        self.assertEqual(self.callback.bot.send_photo.await_count, 2)
        self.callback.bot.send_message.assert_not_awaited()
        storage.mark_broadcast_recipient.assert_called_once_with(1, 8, "sent", sent_message=(8, 102))

    async def test_photo_routes_after_incoming_message_is_deleted(self):
        dispatcher = Dispatcher(storage=self.memory)
        local_router = Router()
        local_router.message.handlers.extend(admin_router.message.handlers)
        dispatcher.include_router(local_router)
        dispatcher.message.outer_middleware(DeletePrivateMessagesMiddleware())
        self.storage.record_bot_user = unittest.mock.Mock()
        bot = Bot("123456:offline-test-token")
        state = dispatcher.fsm.get_context(bot=bot, chat_id=7, user_id=7)
        await state.set_state(BroadcastDraft.composing)
        message = Message(
            message_id=20, date=datetime.now(UTC), chat=Chat(id=7, type="private"),
            from_user=User(id=7, is_bot=False, first_name="Admin"), caption="caption",
            photo=[PhotoSize(file_id="large", file_unique_id="unique", width=800, height=600)],
        )
        try:
            with patch.object(bot.session, "make_request", new_callable=AsyncMock, return_value=True) as request, patch("bot.handlers.admin.edit_panel_content", new_callable=AsyncMock):
                await dispatcher.feed_update(bot, Update(update_id=1, message=message), settings=self.settings, storage=self.storage, api=None)
                self.assertEqual(request.call_args.args[1].__api_method__, "deleteMessage")
                self.assertEqual((await state.get_data())["broadcast_photo_file_id"], "large")
                self.assertEqual(await state.get_state(), BroadcastDraft.choosing_duration.state)
        finally:
            await bot.session.close()

    async def test_unsupported_file_routes_to_hint_but_commands_are_not_consumed(self):
        dispatcher = Dispatcher(storage=self.memory)
        local_router = Router()
        local_router.message.handlers.extend(admin_router.message.handlers)
        dispatcher.include_router(local_router)
        self.storage.record_bot_user = unittest.mock.Mock()
        bot = Bot("123456:offline-test-token")
        state = dispatcher.fsm.get_context(bot=bot, chat_id=7, user_id=7)
        await state.set_state(BroadcastDraft.choosing_photo)
        await state.update_data(broadcast_text="existing", broadcast_ttl_seconds=600)
        common = dict(message_id=20, date=datetime.now(UTC), chat=Chat(id=7, type="private"), from_user=User(id=7, is_bot=False, first_name="Admin"))
        try:
            with patch("bot.handlers.admin.edit_panel_content", new_callable=AsyncMock) as panel:
                document = Document(file_id="doc", file_unique_id="doc-unique", mime_type="image/png")
                await dispatcher.feed_update(bot, Update(update_id=1, message=Message(**common, document=document)), settings=self.settings, storage=self.storage, api=None)
                self.assertIn("как фото", panel.call_args.args[6])
                panel.reset_mock()
                await dispatcher.feed_update(bot, Update(update_id=2, message=Message(**common, text="/start")), settings=self.settings, storage=self.storage, api=None)
                panel.assert_not_awaited()
                self.assertNotIn("broadcast_photo_file_id", await state.get_data())
        finally:
            await bot.session.close()

    async def test_worker_sends_without_unsubscribe_button_and_records_deletion(self):
        recipient = {"campaign_id": 1, "admin_user_id": 7, "telegram_user_id": 8, "text": "test", "delete_after_seconds": 600}
        storage = unittest.mock.Mock()
        storage.next_broadcast_recipient.side_effect = [recipient, None]
        storage.can_receive_broadcast.return_value = True
        storage.mark_broadcast_recipient.return_value = True
        with patch("bot.services.broadcasts._send_completion_report", new_callable=AsyncMock), patch("bot.services.broadcasts.asyncio.sleep", new_callable=AsyncMock, side_effect=[None, asyncio.CancelledError]):
            with self.assertRaises(asyncio.CancelledError):
                await broadcast_worker(self.callback.bot, storage)
        self.callback.bot.send_message.assert_awaited_once()
        self.assertEqual(self.callback.bot.send_message.call_args.args, (8, "test"))
        sent_kwargs = dict(self.callback.bot.send_message.call_args.kwargs)
        self.assert_delete_keyboard(sent_kwargs.pop("reply_markup"), "broadcast:delete:1")
        self.assertEqual(sent_kwargs, {"disable_web_page_preview": True})
        storage.mark_broadcast_recipient.assert_called_once_with(1, 8, "sent", sent_message=(7, 101))

    async def test_delete_button_only_deletes_own_delivery_and_counts_once_after_restart(self):
        with tempfile.TemporaryDirectory() as directory:
            storage = BotStorage(str(Path(directory) / "bot.db"), Fernet.generate_key())
            storage.initialize()
            try:
                storage.record_bot_user(7)
                storage.record_bot_user(8)
                campaign, _ = storage.create_broadcast(7, "announcement", 600)
                storage.mark_broadcast_recipient(campaign, 7, "sent", sent_message=(7, 101))
                storage.mark_broadcast_recipient(campaign, 8, "sent", sent_message=(8, 102))
                bot = SimpleNamespace(delete_message=AsyncMock())
                callback = SimpleNamespace(
                    data=f"broadcast:delete:{campaign}", from_user=SimpleNamespace(id=7),
                    message=SimpleNamespace(chat=SimpleNamespace(id=8, type="private"), message_id=102),
                    bot=bot, answer=AsyncMock(),
                )
                await delete_broadcast_notification(callback, self.settings, storage)
                bot.delete_message.assert_not_awaited()
                callback.from_user.id = 8
                callback.message.message_id = 999
                await delete_broadcast_notification(callback, self.settings, storage)
                bot.delete_message.assert_not_awaited()
                self.assertEqual(storage.broadcast_summary(campaign)["delete_clicks"], 0)
                callback.message.message_id = 102
                await delete_broadcast_notification(callback, self.settings, storage)
                bot.delete_message.assert_awaited_once_with(8, 102)
                storage.close()
                storage.initialize()
                await delete_broadcast_notification(callback, self.settings, storage)
                self.assertEqual(storage.broadcast_summary(campaign)["delete_clicks"], 1)
                self.assertTrue(storage.can_receive_broadcast(8))
            finally:
                storage.close()

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
