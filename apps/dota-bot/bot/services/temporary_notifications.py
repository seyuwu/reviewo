import asyncio
from collections.abc import Awaitable, Callable

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
    async def send():
        return await bot.send_message(chat_id, text, **kwargs)
    message = await deliver_temporary_notification(storage, telegram_user_id, ttl_seconds, send)
    assert message is not None
    return message


async def deliver_temporary_notification(
    storage: BotStorage, telegram_user_id: int, ttl_seconds: int,
    send: Callable[[], Awaitable[Message | None]],
) -> Message | None:
    """Serialize a text or media notice with the existing temporary messages."""
    lock = _user_notification_locks.setdefault(telegram_user_id, asyncio.Lock())
    async with lock:
        while storage.has_short_lived_temporary_message(telegram_user_id):
            await asyncio.sleep(0.2)

        message = await send()
        if message is None:
            return None
        storage.add_temporary_message(
            telegram_user_id,
            message.chat.id,
            message.message_id,
            ttl_seconds,
        )
        return message
