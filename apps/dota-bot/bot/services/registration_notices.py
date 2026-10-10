import asyncio
import logging

from aiogram.exceptions import TelegramAPIError, TelegramForbiddenError, TelegramRetryAfter
from aiogram.types import MessageEntity

from .referral_sharing import referral_share_keyboard
from .temporary_notifications import deliver_temporary_notification

logger = logging.getLogger(__name__)


async def send_registration_message(bot, user_id, notice, storage=None):
    entities = [MessageEntity.model_validate(value) for value in notice.get("entities", [])]
    kwargs = {}
    if storage is not None and notice.get("share_enabled") and storage.registration_notice_config()["share_enabled"]:
        kwargs["reply_markup"] = referral_share_keyboard()
    if notice.get("photo_file_id"):
        return await bot.send_photo(
            user_id, notice["photo_file_id"], caption=notice["text"] or None,
            caption_entities=entities, parse_mode=None, **kwargs,
        )
    return await bot.send_message(
        user_id, notice["text"], entities=entities, parse_mode=None, disable_web_page_preview=True, **kwargs,
    )


async def registration_notice_worker(bot, storage):
    while True:
        try:
            notice = storage.next_registration_notice()
            if notice is None:
                await asyncio.sleep(1)
                continue
            user_id = notice["telegram_user_id"]

            async def send():
                # Recheck after waiting for other notices. Disabling cancels pending deliveries.
                if not storage.claim_registration_notice(user_id):
                    return None
                if not storage.can_receive_broadcast(user_id):
                    storage.finish_registration_notice(user_id, "skipped")
                    return None
                return await send_registration_message(bot, user_id, notice, storage)

            try:
                message = await deliver_temporary_notification(storage, user_id, notice["ttl_seconds"], send)
                if message is not None:
                    storage.finish_registration_notice(user_id, "sent")
            except TelegramRetryAfter as error:
                storage.finish_registration_notice(user_id, "pending", float(error.retry_after) + 1)
            except TelegramForbiddenError:
                storage.mark_bot_user_blocked(user_id)
                storage.finish_registration_notice(user_id, "failed")
            except TelegramAPIError:
                # A transport error may follow delivery: avoid duplicate announcements.
                storage.finish_registration_notice(user_id, "failed")
                logger.warning("Registration notice delivery failed for user %s", user_id)
            await asyncio.sleep(0.05)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Registration notice worker failed")
            await asyncio.sleep(2)
