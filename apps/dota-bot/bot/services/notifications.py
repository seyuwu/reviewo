import asyncio
import logging

from aiogram import Bot
from aiogram.exceptions import TelegramBadRequest, TelegramForbiddenError

from ..api.client import OpiniaApi
from ..config import Settings
from ..handlers.party import send_party_notification
from ..storage.database import BotStorage

logger = logging.getLogger(__name__)


async def poll_notifications(bot: Bot, api: OpiniaApi, settings: Settings, storage: BotStorage) -> None:
    while True:
        try:
            rows = await api.poll_notifications()
            for row in rows:
                notification_id = str(row["id"])
                telegram_user_id = int(row["telegramUserId"])
                if storage.has_delivered_notification(notification_id):
                    delivered = True
                else:
                    delivered = await send_party_notification(bot, settings, storage, api, row)
                    if delivered:
                        storage.remember_delivered_notification(notification_id)
                await api.record_notification_delivery(notification_id, telegram_user_id, delivered)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Telegram notification poll failed")
        await asyncio.sleep(5)


async def cleanup_temporary_messages(bot: Bot, storage: BotStorage) -> None:
    while True:
        try:
            for _, chat_id, message_id in storage.due_temporary_messages():
                try:
                    await bot.delete_message(chat_id, message_id)
                except (TelegramBadRequest, TelegramForbiddenError):
                    pass
                finally:
                    storage.remove_temporary_message(chat_id, message_id)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Temporary message cleanup failed")
        await asyncio.sleep(3)
