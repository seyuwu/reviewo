import asyncio
import logging
import os
from pathlib import Path

from aiogram import Bot, Dispatcher
from aiogram.fsm.storage.memory import MemoryStorage

from .config import load_settings
from .handlers import router
from .rate_limit import HourlyRateLimiter
from .replies import load_templates
from .storage import WelcomeFlowStorage


def load_dotenv_file() -> None:
    """Optional local .env without extra dependency."""
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.is_file():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


async def main() -> None:
    logging.basicConfig(
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        level=logging.INFO,
    )

    load_dotenv_file()
    settings = load_settings()
    templates = load_templates(Path(settings.templates_path), settings, settings.channel_url)

    storage = WelcomeFlowStorage(settings.database_path)
    storage.initialize()

    rate_limiter = HourlyRateLimiter(settings.hourly_cap)

    bot = Bot(token=settings.bot_token)
    dispatcher = Dispatcher(storage=MemoryStorage())
    dispatcher.include_router(router)

    try:
        await bot.delete_webhook(drop_pending_updates=True)
        logging.info("Welcome Flow bot started (long polling).")
        await dispatcher.start_polling(
            bot,
            settings=settings,
            storage=storage,
            templates=templates,
            rate_limiter=rate_limiter,
        )
    finally:
        storage.close()
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())
