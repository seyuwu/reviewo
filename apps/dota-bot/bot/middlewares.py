import logging

from aiogram import BaseMiddleware
from aiogram.exceptions import TelegramAPIError
from aiogram.types import Message

logger = logging.getLogger(__name__)


class DeletePrivateMessagesMiddleware(BaseMiddleware):
    async def __call__(self, handler, event, data):
        if isinstance(event, Message) and event.chat.type == "private":
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
