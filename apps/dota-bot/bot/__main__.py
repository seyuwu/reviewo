import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.client.session.aiohttp import AiohttpSession
from aiogram.fsm.storage.memory import MemoryStorage

from .api.client import OpiniaApi
from .config import load_settings
from .handlers import router
from .middlewares import DeletePrivateMessagesMiddleware
from .services.notifications import (
    cleanup_temporary_messages,
    poll_notifications,
    reconcile_saved_telegram_links,
)
from .services.auto_matcher import auto_match_loop
from .services.panel import refresh_active_search_panels
from .storage.database import BotStorage


async def main() -> None:
    logging.basicConfig(
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        level=logging.INFO,
    )
    settings = load_settings()
    storage = BotStorage(settings.database_path, settings.encryption_key)
    storage.initialize()
    bot = Bot(
        token=settings.bot_token,
        session=AiohttpSession(proxy=settings.telegram_proxy) if settings.telegram_proxy else None,
    )
    api = OpiniaApi(settings, storage)
    await api.start()
    match_wakeup = asyncio.Event()
    dispatcher = Dispatcher(storage=MemoryStorage())
    dispatcher.include_router(router)
    dispatcher.message.outer_middleware(DeletePrivateMessagesMiddleware())
    tasks = [
        asyncio.create_task(reconcile_saved_telegram_links(api, storage)),
        asyncio.create_task(poll_notifications(bot, api, settings, storage)),
        asyncio.create_task(cleanup_temporary_messages(bot, storage)),
        asyncio.create_task(auto_match_loop(bot, api, settings, storage, match_wakeup)),
        asyncio.create_task(refresh_active_search_panels(bot, api, settings, storage)),
    ]

    try:
        await bot.delete_webhook(drop_pending_updates=False)
        logging.info("Dota.Opinia Telegram bot started in long polling mode.")
        await dispatcher.start_polling(
            bot,
            api=api,
            settings=settings,
            storage=storage,
            match_wakeup=match_wakeup,
        )
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        storage.close()
        await api.close()
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())
