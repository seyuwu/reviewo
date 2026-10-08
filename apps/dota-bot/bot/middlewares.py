import asyncio
import logging
import time

from aiogram import BaseMiddleware
from aiogram.exceptions import TelegramAPIError
from aiogram.types import CallbackQuery, Message

logger = logging.getLogger(__name__)


class DeletePrivateMessagesMiddleware(BaseMiddleware):
    async def __call__(self, handler, event, data):
        if isinstance(event, Message) and event.chat.type == "private":
            command = (event.text or "").split(maxsplit=1)
            command_name = command[0].split("@", maxsplit=1)[0] if command else ""
            storage = data.get("storage")
            if (
                event.from_user is not None
                and command_name != "/start"
                and command_name != "/id"
                and storage is not None
            ):
                storage.record_bot_user(event.from_user.id)
            if command_name == "/start":
                api = data.get("api")
                if event.from_user is not None and api is not None:
                    try:
                        await api.record_telegram_bot_started(event.from_user.id)
                    except Exception:
                        # Keep bot onboarding available during a temporary API outage;
                        # another /start or a successful link confirmation will retry.
                        logger.exception(
                            "Could not record Telegram bot start for user=%s",
                            event.from_user.id,
                        )
                # Keep /start visible until the handler has delivered the replacement panel.
                return await handler(event, data)
            try:
                await event.delete()
            except TelegramAPIError as error:
                # The bot still handles the update if Telegram refuses deletion.
                logger.warning(
                    "Could not delete incoming private message chat=%s message=%s: %s",
                    event.chat.id,
                    event.message_id,
                    error,
                )
        return await handler(event, data)


class RecordPrivateCallbackActivityMiddleware(BaseMiddleware):
    async def __call__(self, handler, event, data):
        if isinstance(event, CallbackQuery):
            message = event.message
            storage = data.get("storage")
            if (
                message is not None
                and message.chat.type == "private"
                and storage is not None
            ):
                storage.record_bot_user(event.from_user.id)
        return await handler(event, data)


class TelegramUsernameSyncMiddleware(BaseMiddleware):
    """Sync trusted Telegram usernames after handling an update, off the request path."""

    def __init__(self) -> None:
        self.tasks: dict[int, asyncio.Task] = {}

    async def __call__(self, handler, event, data):
        result = await handler(event, data)
        message = event.message if isinstance(event, CallbackQuery) else event
        user = getattr(event, "from_user", None)
        storage = data.get("storage")
        api = data.get("api")
        if (
            user is not None and message is not None and message.chat.type == "private"
            and storage is not None
        ):
            storage.update_bot_user_username(user.id, user.username)
        if (
            user is None or message is None or message.chat.type != "private"
            or storage is None or api is None or storage.get_session(user.id) is None
            or user.id in self.tasks
        ):
            return result
        saved = storage.get_choice(user.id, "telegram_username_sync", 0) or {}
        if saved.get("retryAfter", 0) > time.time():
            return result
        if saved.get("username") == user.username and time.time() - saved.get("syncedAt", 0) < 86400:
            return result
        task = asyncio.create_task(self._sync(api, storage, user.id, user.username))
        self.tasks[user.id] = task
        task.add_done_callback(lambda done: self.tasks.pop(user.id, None))
        return result

    async def _sync(self, api, storage, telegram_user_id: int, username: str | None) -> None:
        try:
            await api.ensure_telegram_link(telegram_user_id, telegram_username=username)
            storage.set_choices(telegram_user_id, "telegram_username_sync", [
                {"username": username, "syncedAt": time.time()}
            ])
        except asyncio.CancelledError:
            raise
        except Exception:
            # Keep successful data, and avoid retrying on every click if the API is down.
            try:
                saved = storage.get_choice(telegram_user_id, "telegram_username_sync", 0) or {}
                saved["retryAfter"] = time.time() + 300
                storage.set_choices(telegram_user_id, "telegram_username_sync", [saved])
            except Exception:
                pass
            logger.warning("Could not sync Telegram username for user %s", telegram_user_id)

    async def close(self) -> None:
        tasks = list(self.tasks.values())
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
