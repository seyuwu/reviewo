import asyncio

from aiogram import Bot
from aiogram.types import Message

from ..storage.database import BotStorage

_user_notification_locks: dict[int, asyncio.Lock] = {}


async def send_temporary_notification(
    bot: Bot,
    storage: BotStorage,
    telegram_user_id: int,
    chat_id: int,
    text: str,
    ttl_seconds: int,
    **kwargs,
) -> Message:
    lock = _user_notification_locks.setdefault(telegram_user_id, asyncio.Lock())
    async with lock:
        while storage.has_short_lived_temporary_message(telegram_user_id):
            await asyncio.sleep(0.2)

        message = await bot.send_message(chat_id, text, **kwargs)
        storage.add_temporary_message(
            telegram_user_id,
            message.chat.id,
            message.message_id,
            ttl_seconds,
        )
        return message
