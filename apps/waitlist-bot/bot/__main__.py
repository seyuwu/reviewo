import asyncio
import logging

from aiogram import Bot, Dispatcher

from .config import load_settings
from .handlers import router
from .storage import WaitlistStorage


async def main() -> None:
    logging.basicConfig(
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        level=logging.INFO,
    )

    settings = load_settings()
    storage = WaitlistStorage(settings.database_path)
    storage.initialize()

    bot = Bot(token=settings.bot_token)
    dispatcher = Dispatcher()
    dispatcher.include_router(router)

    try:
        await bot.delete_webhook(drop_pending_updates=True)
        logging.info("Opinia waitlist bot started in long polling mode.")
        await dispatcher.start_polling(bot, settings=settings, storage=storage)
    finally:
        storage.close()
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())
