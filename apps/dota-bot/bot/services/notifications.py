import asyncio
import logging

from aiogram import Bot
from aiogram.exceptions import TelegramAPIError, TelegramBadRequest, TelegramForbiddenError

from ..api.client import OpiniaApi
from ..config import Settings
from ..handlers.party import send_party_notification
from ..storage.database import BotStorage

logger = logging.getLogger(__name__)


async def reconcile_saved_telegram_links(api: OpiniaApi, storage: BotStorage) -> None:
    """Repair Telegram identities for existing bot sessions after deployment/restart."""
    for telegram_user_id in storage.session_user_ids():
        try:
            await api.ensure_telegram_link(telegram_user_id)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Could not restore Telegram identity for a saved bot session")


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
            for telegram_user_id, chat_id, message_id in storage.due_temporary_messages():
                try:
                    await bot.delete_message(chat_id, message_id)
                    storage.remove_temporary_message(chat_id, message_id)
                except (TelegramBadRequest, TelegramForbiddenError) as error:
                    # These are terminal for this message (already deleted or no permission).
                    logger.info(
                        "Cannot delete temporary message for user %s: %s",
                        telegram_user_id,
                        error,
                    )
                    storage.remove_temporary_message(chat_id, message_id)
                except TelegramAPIError as error:
                    # Keep it in storage so transient network/API failures are retried next pass.
                    logger.warning(
                        "Could not delete temporary message for user %s; will retry: %s",
                        telegram_user_id,
                        error,
                    )
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Temporary message cleanup failed")
        await asyncio.sleep(3)
