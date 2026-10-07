from pathlib import Path
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

from aiogram import Bot, Dispatcher, Router
from aiogram.types import CallbackQuery, Update, User
from cryptography.fernet import Fernet

from bot.handlers import router
from bot.handlers.party import router as party_router
from bot.storage.database import BotStorage


def isolated_callback_router(source):
    cloned = Router()
    cloned.callback_query.handlers.extend(source.callback_query.handlers)
    for child in source.sub_routers:
        cloned.include_router(isolated_callback_router(child))
    return cloned


class FriendInviteRoutingTests(unittest.IsolatedAsyncioTestCase):
    async def test_main_menu_friend_invite_reaches_sharing_handler(self):
        with tempfile.TemporaryDirectory() as folder:
            storage = BotStorage(str(Path(folder) / "bot.db"), Fernet.generate_key())
            storage.initialize()
            bot = Bot("123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi")
            dispatcher = Dispatcher()
            dispatcher.include_router(isolated_callback_router(router))
            callback = CallbackQuery(id="friend-invite", chat_instance="test", data="invite:friends",
                from_user=User(id=7, is_bot=False, first_name="Player", username="player"))
            try:
                with patch.object(bot, "get_me", new_callable=AsyncMock,
                                  return_value=User(id=123456, is_bot=True, first_name="FDP", username="FDPdotabot")), \
                     patch.object(bot.session, "make_request", new_callable=AsyncMock, return_value=True) as answer, \
                     patch("bot.handlers.party_links.acknowledge_callback"), \
                     patch("bot.handlers.party_links.send_temporary_notification", new_callable=AsyncMock) as send:
                    await dispatcher.feed_update(bot, Update(update_id=1, callback_query=callback),
                                                 api=AsyncMock(), settings=object(), storage=storage)
                    self.assertFalse(any(getattr(call.args[1], "text", None) == "Приглашение не найдено" for call in answer.await_args_list),
                                     "Friend invitation was intercepted as a party invitation")
                    send.assert_awaited_once()
                    self.assertIn("https://t.me/FDPdotabot?start=ref_", send.await_args.args[4])
                handler = next(item for item in party_router.callback_query.handlers
                               if item.callback.__name__ == "resolve_invite")
                for data in ["invite:test-id:accept", "invite:test-id:decline"]:
                    query = callback.model_copy(update={"data": data})
                    self.assertTrue((await handler.check(query))[0])
                self.assertFalse((await handler.check(callback))[0])
            finally:
                await bot.session.close()
                storage.close()
