import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.fsm.storage.memory import MemoryStorage

from .api.client import OpiniaApi
from .config import load_settings
from .handlers import router
from .middlewares import (
    DeletePrivateMessagesMiddleware,
    RecordPrivateCallbackActivityMiddleware,
)
from .services.notifications import (
    cleanup_temporary_messages,
    poll_notifications,
    reconcile_saved_telegram_links,
)
from .services.telegram_session import RetryingAiohttpSession
from .services.auto_matcher import auto_match_loop
from .services.broadcasts import broadcast_worker
from .services.log_safety import TelegramTokenRedactionFilter
from .services.panel import (
    recover_loading_panels,
    refresh_active_search_panels,
)
from .services.party_search_queue import PartySearchQueue
from .storage.database import BotStorage


async def main() -> None:
    logging.basicConfig(
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        level=logging.INFO,
    )
    token_filter = TelegramTokenRedactionFilter()
    for handler in logging.getLogger().handlers:
        handler.addFilter(token_filter)
    settings = load_settings()
    storage = BotStorage(settings.database_path, settings.encryption_key)
    storage.initialize()
    bot = Bot(
        token=settings.bot_token,
        session=RetryingAiohttpSession(proxy=settings.telegram_proxy),
    )
    api = OpiniaApi(settings, storage)
    await api.start()
    await recover_loading_panels(bot, api, settings, storage)
    match_wakeup = asyncio.Event()
    party_search_queue = PartySearchQueue(bot, api, settings, storage, match_wakeup)
    dispatcher = Dispatcher(storage=MemoryStorage())
    dispatcher.include_router(router)
    dispatcher.message.outer_middleware(DeletePrivateMessagesMiddleware())
    dispatcher.callback_query.outer_middleware(RecordPrivateCallbackActivityMiddleware())
    tasks = [
        asyncio.create_task(reconcile_saved_telegram_links(api, storage)),
        asyncio.create_task(poll_notifications(bot, api, settings, storage)),
        asyncio.create_task(cleanup_temporary_messages(bot, storage)),
        asyncio.create_task(auto_match_loop(bot, api, settings, storage, match_wakeup)),
        asyncio.create_task(broadcast_worker(bot, storage)),
        asyncio.create_task(
            refresh_active_search_panels(
                bot, api, settings, storage, party_search_queue
            )
        ),
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
            party_search_queue=party_search_queue,
        )
    finally:
        await party_search_queue.close()
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        storage.close()
        await api.close()
        await bot.session.close()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as error:
        logging.getLogger(__name__).critical(
            "Bot process stopped (%s)", type(error).__name__
        )
        raise SystemExit(1) from None
