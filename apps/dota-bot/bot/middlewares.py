import logging

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
                and storage is not None
            ):
                storage.record_bot_user(event.from_user.id)
            if command_name == "/start":
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
