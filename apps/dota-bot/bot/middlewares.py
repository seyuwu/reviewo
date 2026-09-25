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
            except TelegramAPIError:
                # The bot still handles the update if Telegram refuses deletion.
                logger.debug("Could not delete incoming private message", exc_info=True)
        return await handler(event, data)
