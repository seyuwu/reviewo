"""Local-only entry point; the production entry point stays unchanged."""
import asyncio
import os

from aiogram import Bot
from aiogram.filters import Command
from aiogram.types import Message

from bot.__main__ import main
from bot.handlers.admin import router
from bot.services.telegram_session import RetryingAiohttpSession


@router.message(Command("local_id"))
async def local_id(message: Message):
    if message.chat.type == "private" and message.from_user:
        await message.answer(
            f"Ваш Telegram ID: {message.from_user.id}\n"
            "Для доступа к /admin вставьте этот ID в DOTA_BOT_ADMIN_IDS в .env.local-test.",
        )


async def run():
    if os.environ.get("DOTA_BOT_API_BASE_URL") != "http://127.0.0.1:32207":
        raise RuntimeError("Only the isolated local API is allowed")
    probe = Bot(os.environ["DOTA_BOT_TOKEN"], session=RetryingAiohttpSession(proxy=os.environ.get("TELEGRAM_PROXY") or None))
    try:
        identity = await probe.get_me()
        if (identity.username or "").lower() == "fdpdotabot":
            raise RuntimeError("Production bot is forbidden in the local launcher")
    finally:
        await probe.session.close()
    await main()


if __name__ == "__main__":
    asyncio.run(run())
