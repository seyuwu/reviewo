from datetime import UTC, datetime
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

from aiogram import Bot, Dispatcher, Router
from aiogram.filters import CommandStart
from aiogram.types import Message, Update, User, Chat, MessageEntity, InlineKeyboardMarkup
from cryptography.fernet import Fernet

from bot.handlers.party_links import open_party_link
from bot.storage.database import BotStorage


class FriendStartTests(unittest.IsolatedAsyncioTestCase):
    async def test_real_start_filter_sends_new_home_panel_for_new_and_returning_friend(self):
        with tempfile.TemporaryDirectory() as folder:
            storage = BotStorage(str(Path(folder) / "bot.db"), Fernet.generate_key())
            storage.initialize()
            bot = Bot("123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi")
            dispatcher = Dispatcher()
            router = Router()
            router.message(CommandStart(deep_link=True))(open_party_link)
            dispatcher.include_router(router)
            try:
                for existing in (False, True):
                    user_id = 7 if not existing else 8
                    if existing:
                        storage.save_panel(user_id, user_id, 10, "account", False)
                    text = "/start src_referral_friends"
                    update = Update(update_id=user_id, message=Message(
                        message_id=50, date=datetime.now(UTC),
                        chat=Chat(id=user_id, type="private"),
                        from_user=User(id=user_id, is_bot=False, first_name="Friend"),
                        text=text, entities=[MessageEntity(type="bot_command", offset=0, length=6)],
                    ))
                    sent = SimpleNamespace(chat=SimpleNamespace(id=user_id), message_id=70, photo=[])
                    with patch("bot.services.panel.render_screen", new_callable=AsyncMock, return_value=("Добро пожаловать в FDP", InlineKeyboardMarkup(inline_keyboard=[]))), \
                         patch.object(bot, "send_photo", new_callable=AsyncMock, return_value=sent) as send_photo, \
                         patch.object(bot, "send_message", new_callable=AsyncMock, return_value=sent) as send_message, \
                         patch.object(bot, "delete_message", new_callable=AsyncMock), \
                         patch.object(bot, "edit_message_media", new_callable=AsyncMock) as edit_media, \
                         patch.object(bot, "edit_message_text", new_callable=AsyncMock) as edit_text:
                        await dispatcher.feed_update(bot, update, api=object(), settings=object(), storage=storage)
                        self.assertEqual(send_photo.await_count + send_message.await_count, 1)
                        edit_media.assert_not_awaited()
                        edit_text.assert_not_awaited()
                    self.assertEqual(storage.get_panel(user_id).screen, "home")
                    self.assertEqual(storage.get_panel(user_id).message_id, 70)
                    attribution = storage._connection().execute("SELECT acquisition_source, acquisition_campaign FROM bot_users WHERE telegram_user_id = ?", (user_id,)).fetchone()
                    self.assertEqual(tuple(attribution), ("referral", "friends"))
            finally:
                await dispatcher.storage.close()
                await bot.session.close()
                storage.close()

    async def test_party_deep_link_still_opens_party_invitation_instead_of_home(self):
        from aiogram.filters.command import CommandObject
        from unittest.mock import Mock
        message = SimpleNamespace(chat=SimpleNamespace(type="private", id=7), from_user=User(id=7, is_bot=False, first_name="Friend"), bot=object())
        storage = Mock()
        storage.get_panel.return_value = None
        state = SimpleNamespace(clear=AsyncMock())
        with patch("bot.handlers.party_links.begin_panel_transition", new_callable=AsyncMock), \
             patch("bot.handlers.party_links.show_party_invitation", new_callable=AsyncMock) as invitation, \
             patch("bot.handlers.party_links.edit_panel", new_callable=AsyncMock) as home:
            await open_party_link(message, CommandObject(command="start", args="party_m6QvueE"), object(), object(), storage, state)
            invitation.assert_awaited_once()
            self.assertEqual(invitation.await_args.args[-1], "m6QvueE")
            home.assert_not_awaited()
