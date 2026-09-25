from aiogram import F, Router
from aiogram.filters import CommandStart
from aiogram.types import CallbackQuery, Message

from ..api.client import OpiniaApi
from ..config import Settings
from ..services.panel import edit_panel
from ..storage.database import BotStorage

router = Router(name="panel")


@router.message(CommandStart())
async def start_panel(
    message: Message,
    bot,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    if message.chat.type != "private" or message.from_user is None:
        return
    await edit_panel(bot, storage, api, settings, message.from_user.id, "home", message.chat.id)


@router.callback_query(F.data.startswith("panel:"))
async def navigate_panel(
    callback: CallbackQuery,
    bot,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    await callback.answer()
    if callback.message is None:
        return
    if callback.message.chat.type != "private":
        return
    screen = (callback.data or "panel:home").split(":", maxsplit=1)[1]
    await edit_panel(
        bot,
        storage,
        api,
        settings,
        callback.from_user.id,
        screen,
        callback.message.chat.id,
    )
