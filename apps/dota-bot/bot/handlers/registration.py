from html import escape

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

from ..api.client import ApiError, OpiniaApi
from ..config import Settings
from ..services.panel import begin_panel_transition, edit_panel, edit_panel_content
from ..storage.database import BotStorage
from ..ui.keyboards import registration_name_keyboard, registration_roles_keyboard, registration_step_keyboard

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


async def start_profile_registration(
    bot,
    state: FSMContext,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
    telegram_user_id: int,
    chat_id: int | None,
    *,
    invite_code: str | None = None,
    invite_role: str | None = None,
) -> None:
    await state.clear()
    await state.set_state(GuestProfileWizard.display_name)
    data = {"roles": []}
    if invite_code and invite_role in POSITION_NAMES:
        data.update(
            roles=[invite_role],
            required_role=invite_role,
            party_invite_code=invite_code,
            party_invite_role=invite_role,
        )
    await state.update_data(**data)
    has_session = bool(storage.get_session(telegram_user_id))
    if invite_role in POSITION_NAMES:
        text = (
            f"<b>Регистрация · 1/3</b>\n\nВы выбрали роль <b>{POSITION_NAMES[invite_role]}</b>. "
            "После регистрации бот вернёт вас в пати на эту позицию.\n\nКак вас называть?"
        )
    else:
        text = "<b>Регистрация Dota-профиля · 1/3</b>\n\nКак вас называть?"
    await edit_panel_content(
        bot,
        storage,
        api,
        settings,
        telegram_user_id,
        "register:name",
        text,
        registration_name_keyboard(show_login=not has_session, allow_cancel=has_session),
        chat_id,
    )


@router.callback_query(F.data == "profile:edit")
async def begin_profile_edit(
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
    try:
        profile = await api.user(callback.from_user.id, "GET", "/dota/profiles/me")
    except ApiError as error:
        await edit_panel_content(
            callback.bot,
            storage,
            api,
            settings,
            callback.from_user.id,
            "profile:edit:error",
            f"<b>Не получилось открыть профиль для изменения</b>\n\n{escape(str(error))}",
            registration_name_keyboard(show_login=False, allow_cancel=True),
            callback.message.chat.id,
        )
        return

    await state.clear()
    await state.set_state(GuestProfileWizard.display_name)
    await state.update_data(
        editing_profile=True,
        display_name=profile.get("title") or "",
        mmr=profile.get("mmr") or "",
        roles=[str(role) for role in profile.get("roles", []) if str(role) in POSITION_NAMES],
    )
    await edit_panel_content(
        callback.bot,
        storage,
        api,
        settings,
        callback.from_user.id,
        "profile:edit:name",
        "<b>Изменение профиля · 1/3</b>\n\n"
        f"Сейчас: <b>{escape(str(profile.get('title') or '—'))}</b>\n"
        "Напишите новое имя для профиля.",
        registration_step_keyboard(),
        callback.message.chat.id,
    )


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
    await start_profile_registration(
        callback.bot,
        state,
        api,
        settings,
        storage,
        callback.from_user.id,
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
    editing = bool((await state.get_data()).get("editing_profile"))
    if not value or len(value) > 80:
        await edit_panel_content(
            message.bot,
            storage,
            api,
            settings,
            message.from_user.id,
            "register:name",
            f"<b>{'Изменение профиля' if editing else 'Создание Dota-профиля'} · 1/3</b>\n\nИмя должно быть длиной от 1 до 80 символов. Напишите другое имя.",
            registration_name_keyboard(
                show_login=not bool(storage.get_session(message.from_user.id)),
                allow_cancel=bool(storage.get_session(message.from_user.id)),
            ),
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
        f"<b>{'Изменение профиля' if editing else 'Создание Dota-профиля'} · 2/3</b>\n\nИмя: <b>{escape(value)}</b>\n\nУкажите MMR числом от 0 до 18000.",
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
    data = await state.get_data()
    editing = bool(data.get("editing_profile"))
    if not value.isdigit() or not 0 <= int(value) <= 18000:
        await edit_panel_content(
            message.bot,
            storage,
            api,
            settings,
            message.from_user.id,
            "register:mmr",
            f"<b>{'Изменение профиля' if editing else 'Создание Dota-профиля'} · 2/3</b>\n\nНужен MMR числом от 0 до 18000. Напишите значение ещё раз.",
            registration_step_keyboard(),
            message.chat.id,
        )
        return
    required_role = data.get("required_role")
    roles = list(data.get("roles") or []) if editing else []
    if required_role in POSITION_NAMES:
        roles = [required_role]
    await state.update_data(mmr=value, roles=roles)
    await state.set_state(GuestProfileWizard.roles)
    await show_roles_panel(
        message.bot, storage, api, settings, message.from_user.id, message.chat.id,
        roles,
        editing=editing,
    )


@router.callback_query(F.data.startswith("register:toggle:"))
async def toggle_registration_role(callback: CallbackQuery, state: FSMContext, storage: BotStorage, api: OpiniaApi, settings: Settings) -> None:
    await callback.answer()
    role = (callback.data or "").rsplit(":", maxsplit=1)[-1]
    if role not in POSITION_NAMES or await state.get_state() != GuestProfileWizard.roles.state:
        return
    data = await state.get_data()
    roles = list(data.get("roles") or [])
    required_role = data.get("required_role")
    if role in roles:
        if role == required_role:
            await callback.answer("Эта позиция выбрана для вступления в пати", show_alert=True)
            return
        roles.remove(role)
    else:
        roles.append(role)
        roles.sort()
    await state.update_data(roles=roles)
    if callback.message:
        await show_roles_panel(
            callback.bot, storage, api, settings, callback.from_user.id, callback.message.chat.id, roles,
            editing=bool(data.get("editing_profile")),
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
    data = await state.get_data()
    await state.clear()
    await edit_panel(
        callback.bot,
        storage,
        api,
        settings,
        callback.from_user.id,
        "profile" if data.get("editing_profile") else "home",
    )


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
    invite_code = data.get("party_invite_code")
    invite_role = data.get("party_invite_role")
    editing_profile = bool(data.get("editing_profile"))
    if invite_role in POSITION_NAMES and invite_role not in roles:
        roles.append(invite_role)
    if not roles:
        await callback.answer("Выберите хотя бы одну позицию", show_alert=True)
        return
    if not data.get("display_name") or not data.get("mmr"):
        await callback.answer("Начните регистрацию заново через /start", show_alert=True)
        await state.clear()
        return

    await callback.answer("Сохраняю профиль…" if editing_profile else "Создаю профиль…")
    await begin_panel_transition(callback.bot, storage, callback.from_user.id, callback.message.chat.id if callback.message else None)
    recovery_url = None
    try:
        profile = {
            "title": data["display_name"],
            "mmr": data["mmr"],
            "roles": roles,
        }
        if not editing_profile:
            profile["server"] = "EU"
        if editing_profile:
            await api.user(callback.from_user.id, "PATCH", "/dota/profiles/me", profile)
        elif storage.get_session(callback.from_user.id):
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
            await api.ensure_telegram_link(callback.from_user.id)
        await state.clear()
        if editing_profile:
            await edit_panel(callback.bot, storage, api, settings, callback.from_user.id, "profile")
            return
        if invite_code and invite_role in POSITION_NAMES:
            from .party_links import finish_party_join

            await finish_party_join(
                callback.bot,
                api,
                settings,
                storage,
                callback.from_user.id,
                callback.message.chat.id if callback.message else None,
                invite_code,
                invite_role,
                recovery_url,
            )
            return
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
                editing=editing_profile,
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
    editing: bool = False,
) -> None:
    names = ", ".join(POSITION_NAMES[role] for role in selected) or "не выбраны"
    title = "Изменение профиля" if editing else "Создание Dota-профиля"
    text = f"<b>{title} · 3/3</b>\n\nВыберите позиции кнопками ниже. Можно выбрать несколько."
    text += f"\n\nВыбрано: <b>{escape(names)}</b>"
    if error:
        verb = "сохранить" if editing else "создать"
        text += f"\n\nНе получилось {verb} профиль: {escape(error)}"
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
