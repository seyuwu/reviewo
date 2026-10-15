import asyncio
import logging

from aiogram import Bot
from aiogram.exceptions import TelegramAPIError, TelegramBadRequest, TelegramForbiddenError, TelegramRetryAfter

from ..api.client import OpiniaApi
from ..config import Settings
from ..handlers.party import send_party_notification
from ..storage.database import BotStorage
from .party_discord import DeletePartyEphemeralMessage

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
                elif (row.get("payload") or {}).get("type") == "tournament_application":
                    from .tournament_applications import deliver_tournament_application_notice
                    delivered = await deliver_tournament_application_notice(bot, api, settings, storage, row)
                    if delivered:
                        storage.remember_delivered_notification(notification_id)
                elif (row.get("payload") or {}).get("type") in {"tournament_recruiting", "tournament_team_invite"}:
                    from .tournament_recruitment import deliver_tournament_recruitment_notice
                    delivered = await deliver_tournament_recruitment_notice(bot, api, settings, storage, row)
                    if delivered:
                        storage.remember_delivered_notification(notification_id)
                elif (row.get("payload") or {}).get("type") == "tournament_participation":
                    from .tournament_participation import deliver_tournament_participation_notice
                    delivered = await deliver_tournament_participation_notice(bot, api, settings, storage, row)
                    if delivered:
                        storage.remember_delivered_notification(notification_id)
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


async def cleanup_temporary_ephemeral_messages(bot: Bot, storage: BotStorage, bot_id: int) -> None:
    for chat_id, receiver_id, message_id in storage.due_temporary_ephemeral_messages(bot_id):
        try:
            success = await bot(DeletePartyEphemeralMessage(chat_id=chat_id,
                receiver_user_id=receiver_id, ephemeral_message_id=message_id), request_timeout=2)
            if not success:
                storage.add_temporary_ephemeral_message(bot_id, chat_id, receiver_id, message_id, 10)
                continue
        except (TelegramBadRequest, TelegramForbiddenError):
            pass  # Already absent or no longer accessible; never touch ordinary group messages.
        except TelegramRetryAfter as error:
            storage.add_temporary_ephemeral_message(bot_id, chat_id, receiver_id, message_id, error.retry_after + 1)
            continue
        except TelegramAPIError:
            storage.add_temporary_ephemeral_message(bot_id, chat_id, receiver_id, message_id, 10)
            continue
        storage.remove_temporary_ephemeral_message(bot_id, chat_id, receiver_id, message_id)


async def cleanup_temporary_messages(bot: Bot, storage: BotStorage, *, bot_id: int | None = None,
                                     ephemeral_only: bool = False) -> None:
    while True:
        try:
            for telegram_user_id, chat_id, message_id in ([] if ephemeral_only else storage.due_temporary_messages()):
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
            if bot_id is not None:
                await cleanup_temporary_ephemeral_messages(bot, storage, bot_id)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Temporary message cleanup failed")
        await asyncio.sleep(1)
