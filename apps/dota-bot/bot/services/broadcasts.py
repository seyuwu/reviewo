import asyncio
import logging

from aiogram import Bot
from aiogram.exceptions import (
    TelegramAPIError,
    TelegramBadRequest,
    TelegramForbiddenError,
    TelegramNetworkError,
    TelegramRetryAfter,
)
from ..storage.database import BotStorage
from .temporary_notifications import send_temporary_notification

logger = logging.getLogger(__name__)
SEND_INTERVAL_SECONDS = 0.05
MAX_DELIVERY_ATTEMPTS = 5


async def broadcast_worker(bot: Bot, storage: BotStorage) -> None:
    """Deliver durable, confirmed campaigns at a pace below Telegram's free broadcast limit."""
    while True:
        try:
            recipient = storage.next_broadcast_recipient()
            if recipient is None:
                await asyncio.sleep(1)
                continue

            campaign_id = recipient["campaign_id"]
            user_id = recipient["telegram_user_id"]
            if not storage.can_receive_broadcast(user_id):
                completed = storage.mark_broadcast_recipient(
                    campaign_id, user_id, "skipped", "Bot is blocked or user is unavailable", increment_attempt=False
                )
                if completed:
                    await _send_completion_report(bot, storage, recipient)
                continue
            try:
                message = await bot.send_message(
                    user_id,
                    recipient["text"],
                    disable_web_page_preview=True,
                )
            except TelegramRetryAfter as error:
                await asyncio.sleep(float(error.retry_after) + 0.5)
                continue
            except TelegramForbiddenError as error:
                completed = storage.mark_broadcast_recipient(
                    campaign_id, user_id, "blocked", str(error)[:500]
                )
            except TelegramBadRequest as error:
                completed = storage.mark_broadcast_recipient(
                    campaign_id, user_id, "failed", str(error)[:500]
                )
            except (TelegramNetworkError, TelegramAPIError) as error:
                attempts = storage.retry_broadcast_recipient(campaign_id, user_id, str(error))
                if attempts >= MAX_DELIVERY_ATTEMPTS:
                    completed = storage.mark_broadcast_recipient(
                        campaign_id,
                        user_id,
                        "failed",
                        str(error)[:500],
                        increment_attempt=False,
                    )
                else:
                    await asyncio.sleep(min(2**attempts, 30))
                    continue
            else:
                completed = storage.mark_broadcast_recipient(
                    campaign_id, user_id, "sent",
                    sent_message=(message.chat.id, message.message_id),
                )

            if completed:
                await _send_completion_report(bot, storage, recipient)

            await asyncio.sleep(SEND_INTERVAL_SECONDS)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Broadcast worker failed")
            await asyncio.sleep(2)


async def _send_completion_report(bot: Bot, storage: BotStorage, campaign: dict) -> None:
    summary = storage.broadcast_summary(campaign["campaign_id"])
    if not summary:
        return
    report = (
        f"Рассылка #{summary['id']} завершена.\n"
        f"Доставлено: {summary['sent']} из {summary['total']}.\n"
        f"Пропущено: {summary['skipped']}. Заблокировали бота: {summary['blocked']}.\n"
        f"Ошибок: {summary['failed']}."
    )
    try:
        await send_temporary_notification(
            bot,
            storage,
            campaign["admin_user_id"],
            campaign["admin_user_id"],
            report,
            10,
        )
    except TelegramAPIError:
        logger.warning("Could not send completion report for broadcast %s", campaign["campaign_id"])
