from aiogram import F, Router
from aiogram.exceptions import TelegramAPIError
from aiogram.filters import CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from ..api.client import OpiniaApi
from ..config import Settings
from ..services.callbacks import acknowledge_callback
from ..services.panel import begin_panel_transition, edit_panel
from ..storage.database import BotStorage

router = Router(name="panel")


@router.message(CommandStart())
async def start_panel(
    message: Message,
    bot,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
    state: FSMContext,
) -> None:
    if message.chat.type != "private" or message.from_user is None:
        return
    has_existing_panel = storage.get_panel(message.from_user.id) is not None
    storage.record_bot_user(message.from_user.id)
    await state.clear()
    storage.set_choices(message.from_user.id, "pending_onboarding_action", [])
    storage.set_choices(message.from_user.id, "pending_solo_search", [])
    await edit_panel(
        bot,
        storage,
        api,
        settings,
        message.from_user.id,
        "home",
        message.chat.id,
        force_new_message=has_existing_panel,
    )
    if has_existing_panel:
        try:
            await message.delete()
        except TelegramAPIError:
            # The panel is already available; keep working even if Telegram rejects cleanup.
            pass


@router.callback_query(F.data.startswith("panel:"))
async def navigate_panel(
    callback: CallbackQuery,
    bot,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
    state: FSMContext,
) -> None:
    acknowledge_callback(callback)
    if callback.message is None:
        return
    if callback.message.chat.type != "private":
        return
    screen = (callback.data or "panel:home").split(":", maxsplit=1)[1]
    storage.set_choices(callback.from_user.id, "pending_solo_search", [])
    if screen == "home":
        storage.set_choices(callback.from_user.id, "pending_onboarding_action", [])
    await begin_panel_transition(bot, storage, callback.from_user.id, callback.message.chat.id)
    await edit_panel(
        bot,
        storage,
        api,
        settings,
        callback.from_user.id,
        screen,
        callback.message.chat.id,
    )
