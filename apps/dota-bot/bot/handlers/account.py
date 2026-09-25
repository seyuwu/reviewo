import re
from html import escape

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.filters.command import CommandObject
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

from ..api.client import ApiError, OpiniaApi
from ..config import Settings
from ..services.panel import edit_panel, edit_panel_content
from ..storage.database import BotStorage
from ..ui.keyboards import back_keyboard

router = Router(name="account")
CODE_PATTERN = re.compile(r"^\d{8}$")


def link_help_keyboard(settings: Settings) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="Открыть профиль Opinia", url=f"{settings.site_url}/profile")],
            [InlineKeyboardButton(text="← В меню", callback_data="panel:home")],
        ]
    )


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
        await edit_panel_content(
            message.bot,
            storage,
            api,
            settings,
            message.from_user.id,
            "account:link",
            "<b>Привязка аккаунта Opinia</b>\n\nВведите код с сайта командой <code>/link 12345678</code>.",
            link_help_keyboard(settings),
            message.chat.id,
        )
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
        await edit_panel_content(
            message.bot,
            storage,
            api,
            settings,
            message.from_user.id,
            "account:link",
            f"<b>Не получилось привязать аккаунт</b>\n\n{escape(str(error))}",
            link_help_keyboard(settings),
            message.chat.id,
        )


@router.callback_query(F.data == "account:help")
async def account_link_help(
    callback: CallbackQuery,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    await callback.answer()
    await edit_panel_content(
        callback.bot,
        storage,
        api,
        settings,
        callback.from_user.id,
        "account:link",
        "<b>Привязка аккаунта Opinia</b>\n\nОткройте сайт и войдите в аккаунт. В профиле нажмите "
        "«Привязать Telegram», затем отправьте сюда код командой <code>/link 12345678</code>. "
        "Код действует 10 минут.",
        link_help_keyboard(settings),
        callback.message.chat.id if callback.message else None,
    )


@router.callback_query(F.data == "account:recovery")
async def show_recovery_link(
    callback: CallbackQuery,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    await callback.answer()
    session = storage.get_session(callback.from_user.id)
    if callback.message is None:
        return
    if not session or not session.recovery_url:
        await edit_panel_content(
            callback.bot,
            storage,
            api,
            settings,
            callback.from_user.id,
            "account:recovery",
            "Ссылка восстановления недоступна. Аккаунт Opinia привязан.",
            back_keyboard("account"),
            callback.message.chat.id,
        )
        return
    await edit_panel_content(
        callback.bot,
        storage,
        api,
        settings,
        callback.from_user.id,
        "account:recovery",
        "<b>Ссылка восстановления</b>\n\nСохраните её в надёжном месте. Ссылка даёт доступ к аккаунту:\n<code>"
        f"{escape(session.recovery_url)}</code>",
        InlineKeyboardMarkup(
            inline_keyboard=[
                [InlineKeyboardButton(text="Открыть ссылку", url=session.recovery_url)],
                [InlineKeyboardButton(text="← В аккаунт", callback_data="panel:account")],
            ]
        ),
        callback.message.chat.id,
    )


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
