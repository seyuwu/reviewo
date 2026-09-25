from html import escape

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

from ..api.client import ApiError, OpiniaApi
from ..config import Settings
from ..services.panel import begin_panel_transition, edit_panel, edit_panel_content
from ..storage.database import BotStorage
from ..ui.keyboards import registration_roles_keyboard, registration_step_keyboard

router = Router(name="registration")

POSITION_NAMES = {
    "1": "Керри",
    "2": "Мид",
    "3": "Оффлейн",
    "4": "Саппорт",
    "5": "Хард-саппорт",
}


class GuestProfileWizard(StatesGroup):
    display_name = State()
    mmr = State()
    roles = State()


def recovery_keyboard(recovery_url: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="🔐 Открыть ссылку восстановления", url=recovery_url)],
            [InlineKeyboardButton(text="Перейти в меню", callback_data="panel:home")],
        ]
    )


def recovery_text(title: str, recovery_url: str) -> str:
    return (
        f"<b>{escape(title)}</b>\n\n"
        "Сохраните ссылку восстановления в надёжном месте. Её можно открыть кнопкой ниже "
        "или скопировать из блока:\n<code>"
        f"{escape(recovery_url)}"
        "</code>"
    )


@router.callback_query(F.data == "register:start")
async def begin_registration(
    callback: CallbackQuery,
    state: FSMContext,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    await callback.answer()
    if callback.message is None:
        return
    await begin_panel_transition(callback.bot, storage, callback.from_user.id, callback.message.chat.id)
    await state.clear()
    await state.set_state(GuestProfileWizard.display_name)
    await state.update_data(roles=[])
    await edit_panel_content(
        callback.bot,
        storage,
        api,
        settings,
        callback.from_user.id,
        "register:name",
        "<b>Создание Dota-профиля · 1/3</b>\n\nКак показывать ваше имя в профиле? Напишите его сообщением.",
        registration_step_keyboard(),
        callback.message.chat.id,
    )


@router.message(GuestProfileWizard.display_name, F.text & ~F.text.startswith("/"))
async def receive_display_name(
    message: Message,
    state: FSMContext,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    value = (message.text or "").strip()
    if not value or len(value) > 80:
        await edit_panel_content(
            message.bot,
            storage,
            api,
            settings,
            message.from_user.id,
            "register:name",
            "<b>Создание Dota-профиля · 1/3</b>\n\nИмя должно быть длиной от 1 до 80 символов. Напишите другое имя.",
            registration_step_keyboard(),
            message.chat.id,
        )
        return
    await state.update_data(display_name=value)
    await state.set_state(GuestProfileWizard.mmr)
    await edit_panel_content(
        message.bot,
        storage,
        api,
        settings,
        message.from_user.id,
        "register:mmr",
        f"<b>Создание Dota-профиля · 2/3</b>\n\nИмя: <b>{escape(value)}</b>\n\nУкажите MMR числом от 0 до 18000.",
        registration_step_keyboard(),
        message.chat.id,
    )


@router.message(GuestProfileWizard.mmr, F.text & ~F.text.startswith("/"))
async def receive_mmr(
    message: Message,
    state: FSMContext,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    value = (message.text or "").strip().replace(" ", "")
    if not value.isdigit() or not 0 <= int(value) <= 18000:
        await edit_panel_content(
            message.bot,
            storage,
            api,
            settings,
            message.from_user.id,
            "register:mmr",
            "<b>Создание Dota-профиля · 2/3</b>\n\nНужен MMR числом от 0 до 18000. Напишите значение ещё раз.",
            registration_step_keyboard(),
            message.chat.id,
        )
        return
    await state.update_data(mmr=value, roles=[])
    await state.set_state(GuestProfileWizard.roles)
    await show_roles_panel(message.bot, storage, api, settings, message.from_user.id, message.chat.id, [])


@router.callback_query(F.data.startswith("register:toggle:"))
async def toggle_registration_role(callback: CallbackQuery, state: FSMContext, storage: BotStorage, api: OpiniaApi, settings: Settings) -> None:
    await callback.answer()
    role = (callback.data or "").rsplit(":", maxsplit=1)[-1]
    if role not in POSITION_NAMES or await state.get_state() != GuestProfileWizard.roles.state:
        return
    data = await state.get_data()
    roles = list(data.get("roles") or [])
    if role in roles:
        roles.remove(role)
    else:
        roles.append(role)
        roles.sort()
    await state.update_data(roles=roles)
    if callback.message:
        await show_roles_panel(
            callback.bot, storage, api, settings, callback.from_user.id, callback.message.chat.id, roles
        )


@router.callback_query(F.data == "register:cancel")
async def cancel_registration(
    callback: CallbackQuery,
    state: FSMContext,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    await callback.answer("Регистрация отменена")
    await begin_panel_transition(callback.bot, storage, callback.from_user.id, callback.message.chat.id if callback.message else None)
    await state.clear()
    await edit_panel(callback.bot, storage, api, settings, callback.from_user.id, "home")


@router.callback_query(F.data == "register:complete")
async def complete_registration(
    callback: CallbackQuery,
    state: FSMContext,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    data = await state.get_data()
    roles = [role for role in data.get("roles", []) if role in POSITION_NAMES]
    if not roles:
        await callback.answer("Выберите хотя бы одну позицию", show_alert=True)
        return
    if not data.get("display_name") or not data.get("mmr"):
        await callback.answer("Начните регистрацию заново через /start", show_alert=True)
        await state.clear()
        return

    await callback.answer("Создаю профиль…")
    await begin_panel_transition(callback.bot, storage, callback.from_user.id, callback.message.chat.id if callback.message else None)
    recovery_url = None
    try:
        profile = {
            "title": data["display_name"],
            "mmr": data["mmr"],
            "roles": roles,
            "server": "EU",
        }
        if storage.get_session(callback.from_user.id):
            await api.user(callback.from_user.id, "POST", "/dota/profiles", profile)
        else:
            created = await api.public("POST", "/dota/profiles/guest", profile)
            recovery_url = created["recoveryUrl"]
            storage.save_session(
                callback.from_user.id,
                created["accessToken"],
                created["refreshToken"],
                recovery_url,
            )
            linked = await api.link_guest_account(created["accessToken"], callback.from_user.id)
            storage.save_session(
                callback.from_user.id,
                linked["accessToken"],
                linked["refreshToken"],
                recovery_url,
            )
        await state.clear()
        if recovery_url:
            await edit_panel_content(
                callback.bot,
                storage,
                api,
                settings,
                callback.from_user.id,
                "register:recovery",
                recovery_text("Профиль готов", recovery_url),
                recovery_keyboard(recovery_url),
            )
        else:
            await edit_panel(callback.bot, storage, api, settings, callback.from_user.id, "home")
    except ApiError as error:
        if recovery_url and storage.get_session(callback.from_user.id):
            await state.clear()
            await edit_panel_content(
                callback.bot,
                storage,
                api,
                settings,
                callback.from_user.id,
                "register:recovery",
                recovery_text("Профиль создан, но привязка Telegram не завершилась", recovery_url),
                recovery_keyboard(recovery_url),
            )
        else:
            data["error"] = str(error)
            await state.update_data(**data)
            await show_roles_panel(
                callback.bot,
                storage,
                api,
                settings,
                callback.from_user.id,
                callback.message.chat.id if callback.message else None,
                roles,
                str(error),
            )


async def show_roles_panel(
    bot,
    storage: BotStorage,
    api: OpiniaApi,
    settings: Settings,
    telegram_user_id: int,
    chat_id: int | None,
    selected: list[str],
    error: str | None = None,
) -> None:
    names = ", ".join(POSITION_NAMES[role] for role in selected) or "не выбраны"
    text = "<b>Создание Dota-профиля · 3/3</b>\n\nВыберите позиции кнопками ниже. Можно выбрать несколько."
    text += f"\n\nВыбрано: <b>{escape(names)}</b>"
    if error:
        text += f"\n\nНе получилось создать профиль: {escape(error)}"
    await edit_panel_content(
        bot,
        storage,
        api,
        settings,
        telegram_user_id,
        "register:roles",
        text,
        registration_roles_keyboard(selected),
        chat_id,
    )
