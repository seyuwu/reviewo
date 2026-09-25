import re
from html import escape
from urllib.parse import quote

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.filters.command import CommandObject
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

from ..api.client import ApiError, OpiniaApi
from ..config import Settings
from ..services.panel import begin_panel_transition, edit_panel, edit_panel_content
from ..storage.database import BotStorage
from ..ui.keyboards import back_keyboard
from .registration import start_profile_registration

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
        from .party_links import resume_pending_party_invitation

        if await resume_pending_party_invitation(
            message.bot, api, settings, storage, message.from_user.id, message.chat.id
        ):
            return
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
    state: FSMContext,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    await callback.answer()
    form_data = await state.get_data()
    invite_code = form_data.get("party_invite_code")
    if invite_code:
        storage.set_choices(
            callback.from_user.id,
            "pending_party_invite",
            [{"code": invite_code, "role": form_data.get("party_invite_role")}],
        )
    await state.clear()
    await begin_panel_transition(callback.bot, storage, callback.from_user.id, callback.message.chat.id if callback.message else None)
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
    await begin_panel_transition(callback.bot, storage, callback.from_user.id, callback.message.chat.id if callback.message else None)
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


@router.callback_query(F.data == "account:open")
async def open_opinia_account(
    callback: CallbackQuery,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    await callback.answer()
    await begin_panel_transition(callback.bot, storage, callback.from_user.id, callback.message.chat.id if callback.message else None)
    next_path = quote("/profile", safe="")
    try:
        ticket = await api.create_web_access_ticket(callback.from_user.id)
        profile_url = f"{settings.site_url.rstrip('/')}/telegram/access?ticket={quote(ticket, safe='')}&next={next_path}"
        open_profile_button = InlineKeyboardButton(text="🌐 Открыть профиль Opinia", url=profile_url)
    except ApiError as error:
        await edit_panel_content(
            callback.bot,
            storage,
            api,
            settings,
            callback.from_user.id,
            "account:open:error",
            f"<b>Не получилось подготовить вход на сайт</b>\n\n{escape(str(error))}",
            back_keyboard("account"),
            callback.message.chat.id if callback.message else None,
        )
        return
    await edit_panel_content(
        callback.bot,
        storage,
        api,
        settings,
        callback.from_user.id,
        "account:open",
        "<b>Аккаунт Opinia привязан</b>\n\nОткройте профиль на сайте. Чтобы удалить привязку Telegram, используйте отдельную кнопку ниже.",
        InlineKeyboardMarkup(
            inline_keyboard=[
                [open_profile_button],
                [InlineKeyboardButton(text="🔓 Отвязать Telegram", callback_data="account:unlink")],
                [InlineKeyboardButton(text="← Назад", callback_data="panel:account")],
            ]
        ),
        callback.message.chat.id if callback.message else None,
    )


@router.callback_query(F.data == "account:unlink")
async def unlink_account(
    callback: CallbackQuery,
    state: FSMContext,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    await callback.answer()
    await begin_panel_transition(callback.bot, storage, callback.from_user.id, callback.message.chat.id if callback.message else None)
    if storage.get_session(callback.from_user.id):
        try:
            await api.user(callback.from_user.id, "DELETE", "/auth/telegram")
        except ApiError as error:
            await edit_panel_content(
                callback.bot,
                storage,
                api,
                settings,
                callback.from_user.id,
                "account:unlink-error",
                f"<b>Не удалось отвязать Telegram</b>\n\n{escape(str(error))}",
                back_keyboard("account"),
                callback.message.chat.id if callback.message else None,
            )
            return
    storage.unlink(callback.from_user.id)
    await start_profile_registration(
        callback.bot,
        state,
        api,
        settings,
        storage,
        callback.from_user.id,
        callback.message.chat.id if callback.message else None,
    )
