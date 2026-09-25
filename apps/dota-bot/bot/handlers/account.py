import re

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.filters.command import CommandObject
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

from ..api.client import ApiError, OpiniaApi
from ..config import Settings
from ..services.panel import edit_panel
from ..storage.database import BotStorage

router = Router(name="account")
CODE_PATTERN = re.compile(r"^\d{8}$")


@router.message(Command("link"))
async def link_account(
    message: Message,
    command: CommandObject,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    if message.chat.type != "private" or message.from_user is None:
        return
    code = (command.args or "").strip()
    if not CODE_PATTERN.fullmatch(code):
        await message.answer("Введите код с сайта: <code>/link 12345678</code>", parse_mode="HTML")
        return
    try:
        auth = await api.complete_link(code, message.from_user.id)
        storage.save_session(
            message.from_user.id,
            auth["accessToken"],
            auth["refreshToken"],
            clear_recovery_url=True,
        )
        await edit_panel(message.bot, storage, api, settings, message.from_user.id, "home", message.chat.id)
    except ApiError as error:
        await message.answer(str(error))


@router.callback_query(F.data == "account:help")
async def account_link_help(
    callback: CallbackQuery,
    settings: Settings,
    storage: BotStorage,
) -> None:
    await callback.answer()
    message = await callback.message.answer(
        "Откройте сайт Opinia и войдите в аккаунт. В профиле нажмите «Привязать Telegram», "
        "затем отправьте сюда код командой <code>/link 12345678</code>. Код живёт 10 минут.",
        reply_markup=InlineKeyboardMarkup(
            inline_keyboard=[[InlineKeyboardButton(text="Открыть профиль Opinia", url=f"{settings.site_url}/profile")]]
        ),
        parse_mode="HTML",
    )
    storage.add_temporary_message(callback.from_user.id, message.chat.id, message.message_id, 300)


@router.callback_query(F.data == "account:recovery")
async def show_recovery_link(callback: CallbackQuery, storage: BotStorage) -> None:
    await callback.answer()
    session = storage.get_session(callback.from_user.id)
    if not session or not session.recovery_url or callback.message is None:
        return
    message = await callback.message.answer(
        "Сохраните ссылку восстановления аккаунта в надёжном месте:\n" + session.recovery_url,
        disable_web_page_preview=True,
    )
    storage.add_temporary_message(callback.from_user.id, message.chat.id, message.message_id, 300)


@router.callback_query(F.data == "account:unlink")
async def unlink_account(
    callback: CallbackQuery,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    await callback.answer()
    if storage.get_session(callback.from_user.id):
        try:
            await api.user(callback.from_user.id, "DELETE", "/auth/telegram")
        except ApiError:
            pass
    storage.unlink(callback.from_user.id)
    await edit_panel(callback.bot, storage, api, settings, callback.from_user.id, "home")


async def deliver_join_hint(bot, storage: BotStorage, telegram_user_id: int, site_url: str, party_slug: str) -> None:
    link = f"{site_url}/dota/teams/{party_slug}"
    message = await bot.send_message(
        telegram_user_id,
        "Вы теперь в пати! Общайтесь в чате на сайте или переходите в Discord.",
        reply_markup=InlineKeyboardMarkup(
            inline_keyboard=[[InlineKeyboardButton(text="Открыть пати на сайте", url=link)]]
        ),
    )
    storage.add_temporary_message(telegram_user_id, message.chat.id, message.message_id, 10)
