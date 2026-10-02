import asyncio
import re
from html import escape

from aiogram import F, Router
from aiogram.exceptions import TelegramAPIError
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

from ..api.client import ApiError, OpiniaApi
from ..config import Settings
from ..services.callbacks import acknowledge_callback
from ..services.panel import begin_panel_transition, dota_id_guide_photo, edit_panel, edit_panel_content
from ..storage.database import BotStorage
from ..ui.keyboards import (
    back_keyboard,
    profile_edit_field_keyboard,
    profile_edit_keyboard,
    profile_edit_roles_keyboard,
    registration_dota_id_keyboard,
    registration_name_keyboard,
    registration_roles_keyboard,
    registration_step_keyboard,
)

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
    dota_id = State()
    mmr = State()
    roles = State()


class DotaIdOnlyWizard(StatesGroup):
    dota_id = State()


class ProfileEditWizard(StatesGroup):
    display_name = State()
    dota_id = State()
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
    data = {"roles": [], "dota_account_id": ""}
    if invite_code and invite_role in POSITION_NAMES:
        data.update(
            roles=[invite_role],
            required_role=invite_role,
            party_invite_code=invite_code,
            party_invite_role=invite_role,
        )
    await state.update_data(**data)
    registration_heading = (
        "Осталось немного — давайте создадим аккаунт"
        if not storage.get_session(telegram_user_id)
        else "Осталось немного — создадим Dota-профиль"
    )
    if invite_role in POSITION_NAMES:
        text = (
            f"<b>{registration_heading}</b>\n\n"
            f"Регистрация · 1/4. Вы выбрали роль <b>{POSITION_NAMES[invite_role]}</b>. "
            "После регистрации бот вернёт вас в пати на эту позицию.\n\n"
            "Как вас называть?\n\n"
            "Уже есть аккаунт Opinia? Напишите /login для входа."
        )
    else:
        text = (
            f"<b>{registration_heading}</b>\n\n"
            "Регистрация Dota-профиля · 1/4.\n\n"
            "Как вас называть?\n\n"
            "Уже есть аккаунт Opinia? Напишите /login для входа."
        )
    await edit_panel_content(
        bot,
        storage,
        api,
        settings,
        telegram_user_id,
        "register:name",
        text,
        registration_name_keyboard(),
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
    acknowledge_callback(callback)
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
            back_keyboard("profile"),
            callback.message.chat.id,
        )
        return

    await state.clear()
    await state.update_data(profile_snapshot=profile)
    roles = ", ".join(
        POSITION_NAMES[str(role)]
        for role in profile.get("roles", [])
        if str(role) in POSITION_NAMES
    ) or "не выбраны"
    await edit_panel_content(
        callback.bot,
        storage,
        api,
        settings,
        callback.from_user.id,
        "profile:edit",
        "<b>Изменение профиля</b>\n\n"
        "Выберите, какой параметр изменить:\n"
        f"Имя: <b>{escape(str(profile.get('title') or '—'))}</b>\n"
        f"Dota ID: <b>{escape(str(profile.get('dotaAccountId') or '—'))}</b>\n"
        f"MMR: <b>{escape(str(profile.get('mmr') if profile.get('mmr') is not None else '—'))}</b>\n"
        f"Позиции: <b>{escape(roles)}</b>",
        profile_edit_keyboard(),
        callback.message.chat.id,
    )


PROFILE_EDIT_FIELD_CALLBACKS = {
    "profile:edit:field:name": ("display_name", ProfileEditWizard.display_name),
    "profile:edit:field:dota-id": ("dota_id", ProfileEditWizard.dota_id),
    "profile:edit:field:mmr": ("mmr", ProfileEditWizard.mmr),
    "profile:edit:field:roles": ("roles", ProfileEditWizard.roles),
}


@router.callback_query(F.data.in_(PROFILE_EDIT_FIELD_CALLBACKS))
async def choose_profile_edit_field(
    callback: CallbackQuery,
    state: FSMContext,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    if callback.message is None:
        acknowledge_callback(callback)
        return
    action = PROFILE_EDIT_FIELD_CALLBACKS.get(callback.data or "")
    if not action:
        acknowledge_callback(callback)
        return
    acknowledge_callback(callback)

    field, wizard_state = action
    data = await state.get_data()
    profile = data.get("profile_snapshot")
    if not profile:
        try:
            profile = await api.user(callback.from_user.id, "GET", "/dota/profiles/me")
        except ApiError as error:
            acknowledge_callback(callback)
            await edit_panel_content(
                callback.bot,
                storage,
                api,
                settings,
                callback.from_user.id,
                "profile:edit:error",
                f"Не получилось открыть профиль: {escape(str(error))}",
                back_keyboard("profile"),
                callback.message.chat.id,
            )
            return
        await state.update_data(profile_snapshot=profile)

    await begin_panel_transition(callback.bot, storage, callback.from_user.id, callback.message.chat.id)
    await state.set_state(wizard_state)

    if field == "display_name":
        text = (
            "<b>Изменить имя</b>\n\n"
            f"Сейчас: <b>{escape(str(profile.get('title') or '—'))}</b>\n"
            "Напишите новое имя для профиля."
        )
        await edit_panel_content(
            callback.bot, storage, api, settings, callback.from_user.id,
            "profile:edit:name", text, profile_edit_field_keyboard(), callback.message.chat.id,
        )
    elif field == "dota_id":
        current_id = str(profile.get("dotaAccountId") or "не указан")
        text = (
            "<b>Изменить Dota ID</b>\n\n"
            f"Сейчас: <b>{escape(current_id)}</b>\n"
            "Откройте свой профиль в Dota 2 и отправьте цифры справа от ника. "
            "Нужно 8–10 цифр."
        )
        await edit_panel_content(
            callback.bot, storage, api, settings, callback.from_user.id,
            "profile:edit:dota-id", text, profile_edit_field_keyboard(),
            callback.message.chat.id, dota_id_guide_photo(),
        )
    elif field == "mmr":
        current_mmr = profile.get("mmr") if profile.get("mmr") is not None else "—"
        text = (
            "<b>Изменить MMR</b>\n\n"
            f"Сейчас: <b>{escape(str(current_mmr))}</b>\n"
            "Напишите новое значение числом от 0 до 18000."
        )
        await edit_panel_content(
            callback.bot, storage, api, settings, callback.from_user.id,
            "profile:edit:mmr", text, profile_edit_field_keyboard(), callback.message.chat.id,
        )
    else:
        roles = [str(role) for role in profile.get("roles", []) if str(role) in POSITION_NAMES]
        await state.update_data(profile_edit_roles=roles)
        selected = ", ".join(POSITION_NAMES[role] for role in roles) or "не выбраны"
        await edit_panel_content(
            callback.bot, storage, api, settings, callback.from_user.id,
            "profile:edit:roles",
            "<b>Изменить позиции</b>\n\n"
            "Выберите все позиции, на которых готовы играть.\n"
            f"Сейчас выбраны: <b>{escape(selected)}</b>",
            profile_edit_roles_keyboard(roles), callback.message.chat.id,
        )


async def save_single_profile_field(
    bot,
    state: FSMContext,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
    telegram_user_id: int,
    chat_id: int,
    patch: dict,
    screen: str,
    error_text: str,
    keyboard: InlineKeyboardMarkup,
    media_photo=None,
) -> bool:
    try:
        await api.user(telegram_user_id, "PATCH", "/dota/profiles/me", patch)
    except ApiError as error:
        await edit_panel_content(
            bot, storage, api, settings, telegram_user_id, screen,
            f"{error_text}\n\nНе получилось сохранить: {escape(str(error))}",
            keyboard, chat_id, media_photo,
        )
        return False

    await state.clear()
    await edit_panel(bot, storage, api, settings, telegram_user_id, "profile", chat_id)
    return True


@router.message(ProfileEditWizard.display_name, F.text & ~F.text.startswith("/"))
async def receive_profile_edit_name(
    message: Message,
    state: FSMContext,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    value = (message.text or "").strip()
    text = (
        "<b>Изменить имя</b>\n\n"
        "Имя должно быть длиной от 1 до 80 символов. Напишите новое имя."
    )
    if not value or len(value) > 80:
        await edit_panel_content(
            message.bot, storage, api, settings, message.from_user.id,
            "profile:edit:name", text, profile_edit_field_keyboard(), message.chat.id,
        )
        return
    await save_single_profile_field(
        message.bot, state, api, settings, storage, message.from_user.id, message.chat.id,
        {"title": value}, "profile:edit:name", text, profile_edit_field_keyboard(),
    )


@router.message(ProfileEditWizard.dota_id, F.text & ~F.text.startswith("/"))
async def receive_profile_edit_dota_id(
    message: Message,
    state: FSMContext,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    value = (message.text or "").strip()
    text = (
        "<b>Изменить Dota ID</b>\n\n"
        "Введите 8–10 цифр без пробелов. Посмотреть ID можно в профиле Dota 2, справа от ника."
    )
    if not re.fullmatch(r"\d{8,10}", value):
        await edit_panel_content(
            message.bot, storage, api, settings, message.from_user.id,
            "profile:edit:dota-id", text, profile_edit_field_keyboard(),
            message.chat.id, dota_id_guide_photo(),
        )
        return
    await save_single_profile_field(
        message.bot, state, api, settings, storage, message.from_user.id, message.chat.id,
        {"dotaAccountId": value}, "profile:edit:dota-id", text,
        profile_edit_field_keyboard(), dota_id_guide_photo(),
    )


@router.message(ProfileEditWizard.mmr, F.text & ~F.text.startswith("/"))
async def receive_profile_edit_mmr(
    message: Message,
    state: FSMContext,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    value = (message.text or "").strip().replace(" ", "")
    text = "<b>Изменить MMR</b>\n\nВведите MMR числом от 0 до 18000."
    if not value.isdigit() or not 0 <= int(value) <= 18000:
        await edit_panel_content(
            message.bot, storage, api, settings, message.from_user.id,
            "profile:edit:mmr", text, profile_edit_field_keyboard(), message.chat.id,
        )
        return
    await save_single_profile_field(
        message.bot, state, api, settings, storage, message.from_user.id, message.chat.id,
        {"mmr": value}, "profile:edit:mmr", text, profile_edit_field_keyboard(),
    )


@router.callback_query(F.data.startswith("profile:edit:role:toggle:"))
async def toggle_profile_edit_role(callback: CallbackQuery, state: FSMContext, storage: BotStorage, api: OpiniaApi, settings: Settings) -> None:
    role = (callback.data or "").rsplit(":", maxsplit=1)[-1]
    if role not in POSITION_NAMES or await state.get_state() != ProfileEditWizard.roles.state:
        acknowledge_callback(callback)
        return
    data = await state.get_data()
    roles = list(data.get("profile_edit_roles") or [])
    if role in roles:
        roles.remove(role)
    else:
        roles.append(role)
        roles.sort()
    await state.update_data(profile_edit_roles=roles)
    selected = ", ".join(POSITION_NAMES[item] for item in roles) or "не выбраны"
    acknowledge_callback(callback)
    if callback.message:
        await edit_panel_content(
            callback.bot, storage, api, settings, callback.from_user.id,
            "profile:edit:roles",
            "<b>Изменить позиции</b>\n\n"
            "Выберите все позиции, на которых готовы играть.\n"
            f"Сейчас выбраны: <b>{escape(selected)}</b>",
            profile_edit_roles_keyboard(roles), callback.message.chat.id,
        )


@router.callback_query(F.data == "profile:edit:roles:save")
async def save_profile_edit_roles(callback: CallbackQuery, state: FSMContext, api: OpiniaApi, settings: Settings, storage: BotStorage) -> None:
    if await state.get_state() != ProfileEditWizard.roles.state:
        acknowledge_callback(callback)
        return
    roles = [str(role) for role in (await state.get_data()).get("profile_edit_roles", []) if str(role) in POSITION_NAMES]
    if not roles:
        acknowledge_callback(callback, "Оставьте выбранной хотя бы одну позицию")
        return
    acknowledge_callback(callback, "Сохраняю позиции…")
    if callback.message:
        await save_single_profile_field(
            callback.bot, state, api, settings, storage, callback.from_user.id,
            callback.message.chat.id, {"roles": roles}, "profile:edit:roles",
            "<b>Изменить позиции</b>\n\nВыберите все позиции, на которых готовы играть.",
            profile_edit_roles_keyboard(roles),
        )


@router.callback_query(F.data == "profile:edit:cancel")
async def cancel_profile_edit(callback: CallbackQuery, state: FSMContext, api: OpiniaApi, settings: Settings, storage: BotStorage) -> None:
    acknowledge_callback(callback)
    chat_id = callback.message.chat.id if callback.message else None
    await state.clear()
    await begin_panel_transition(callback.bot, storage, callback.from_user.id, chat_id)
    await edit_panel(callback.bot, storage, api, settings, callback.from_user.id, "profile", chat_id)


def telegram_link_retry_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="🔄 Повторить подключение", callback_data="register:retry-link")],
            [InlineKeyboardButton(text="✖️ Отменить", callback_data="register:cancel")],
        ]
    )


@router.callback_query(F.data == "register:start")
async def begin_registration(
    callback: CallbackQuery,
    state: FSMContext,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    acknowledge_callback(callback)
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


@router.callback_query(F.data == "register:retry-link")
async def retry_telegram_link(
    callback: CallbackQuery,
    state: FSMContext,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
    match_wakeup: asyncio.Event,
) -> None:
    acknowledge_callback(callback)
    if callback.message is None:
        return
    await begin_panel_transition(callback.bot, storage, callback.from_user.id, callback.message.chat.id)
    try:
        await api.ensure_telegram_link(callback.from_user.id)
    except ApiError as error:
        await edit_panel_content(
            callback.bot,
            storage,
            api,
            settings,
            callback.from_user.id,
            "register:telegram-link-error",
            "<b>Аккаунт уже создан, но Telegram пока не подключён.</b>\n\n"
            f"Не удалось завершить подключение: {escape(str(error))}.\n\nПопробуйте ещё раз позже.",
            telegram_link_retry_keyboard(),
            callback.message.chat.id,
        )
        return
    await continue_after_profile_saved(
        callback.bot,
        state,
        api,
        settings,
        storage,
        callback.from_user.id,
        callback.message.chat.id,
        await state.get_data(),
        match_wakeup,
    )


@router.callback_query(F.data == "onboarding:register")
async def begin_onboarding_registration(
    callback: CallbackQuery,
    state: FSMContext,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    acknowledge_callback(callback)
    if callback.message is None:
        return
    if not storage.get_choice(callback.from_user.id, "pending_onboarding_action", 0):
        await edit_panel(callback.bot, storage, api, settings, callback.from_user.id, "home", callback.message.chat.id)
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
            f"<b>{'Изменение профиля' if editing else 'Создание Dota-профиля'} · 1/4</b>\n\nИмя должно быть длиной от 1 до 80 символов. Напишите другое имя.",
            registration_name_keyboard(),
            message.chat.id,
        )
        return
    await state.update_data(display_name=value)
    await state.set_state(GuestProfileWizard.dota_id)
    await show_registration_dota_id_panel(
        message.bot,
        storage,
        api,
        settings,
        message.from_user.id,
        message.chat.id,
        await state.get_data(),
    )


async def show_registration_dota_id_panel(
    bot,
    storage: BotStorage,
    api: OpiniaApi,
    settings: Settings,
    telegram_user_id: int,
    chat_id: int | None,
    data: dict,
    error: str | None = None,
) -> None:
    editing = bool(data.get("editing_profile"))
    current_id = str(data.get("dota_account_id") or "")
    text = (
        f"<b>{'Изменение профиля' if editing else 'Регистрация Dota-профиля'} · 2/4</b>\n\n"
        f"Имя: <b>{escape(str(data.get('display_name') or 'Игрок'))}</b>\n\n"
        "Укажите свой Dota ID. В Dota 2 откройте профиль: цифры находятся справа от ника, "
        "как показано на скриншоте. ID состоит из 8–10 цифр.\n\n"
        "Этот шаг необязательный — его можно пропустить и добавить ID позже в профиле."
    )
    if current_id:
        text += f"\n\nСейчас указан: <code>{escape(current_id)}</code>"
    if error:
        text += f"\n\n{escape(error)}"
    await edit_panel_content(
        bot,
        storage,
        api,
        settings,
        telegram_user_id,
        "register:dota-id",
        text,
        registration_dota_id_keyboard(bool(current_id)),
        chat_id,
        dota_id_guide_photo(),
    )


async def continue_registration_after_dota_id(
    bot,
    state: FSMContext,
    storage: BotStorage,
    api: OpiniaApi,
    settings: Settings,
    telegram_user_id: int,
    chat_id: int | None,
) -> None:
    data = await state.get_data()
    editing = bool(data.get("editing_profile"))
    await state.set_state(GuestProfileWizard.mmr)
    text = (
        f"<b>{'Изменение профиля' if editing else 'Регистрация Dota-профиля'} · 3/4</b>\n\n"
        f"Имя: <b>{escape(str(data.get('display_name') or 'Игрок'))}</b>\n"
        f"Dota ID: <b>{escape(str(data.get('dota_account_id') or 'не указан'))}</b>\n\n"
        "Укажите MMR числом от 0 до 18000."
    )
    await edit_panel_content(
        bot,
        storage,
        api,
        settings,
        telegram_user_id,
        "register:mmr",
        text,
        registration_step_keyboard(),
        chat_id,
    )


@router.message(GuestProfileWizard.dota_id, F.text & ~F.text.startswith("/"))
async def receive_registration_dota_id(
    message: Message,
    state: FSMContext,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    value = (message.text or "").strip()
    data = await state.get_data()
    if not re.fullmatch(r"\d{8,10}", value):
        await show_registration_dota_id_panel(
            message.bot,
            storage,
            api,
            settings,
            message.from_user.id,
            message.chat.id,
            data,
            "Введите 8–10 цифр без пробелов или нажмите «Пропустить пока».",
        )
        return
    await state.update_data(dota_account_id=value)
    await continue_registration_after_dota_id(
        message.bot, state, storage, api, settings, message.from_user.id, message.chat.id
    )


@router.callback_query(F.data == "register:dota-id:skip")
async def skip_registration_dota_id(
    callback: CallbackQuery,
    state: FSMContext,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    if await state.get_state() != GuestProfileWizard.dota_id.state:
        acknowledge_callback(callback)
        return
    acknowledge_callback(callback, "Можно добавить Dota ID позже в профиле")
    await continue_registration_after_dota_id(
        callback.bot,
        state,
        storage,
        api,
        settings,
        callback.from_user.id,
        callback.message.chat.id if callback.message else None,
    )


@router.callback_query(F.data == "profile:dota-id")
async def begin_dota_id_edit(
    callback: CallbackQuery,
    state: FSMContext,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    if callback.message is None:
        acknowledge_callback(callback)
        return
    if storage.is_temporary_message(callback.message.chat.id, callback.message.message_id):
        try:
            await callback.message.delete()
        except TelegramAPIError:
            pass
        else:
            storage.remove_temporary_message(callback.message.chat.id, callback.message.message_id)
    panel = storage.get_panel(callback.from_user.id)
    return_screen = panel.screen if panel and panel.screen in {"looking", "party", "profile"} else "profile"
    acknowledge_callback(callback)
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
            "profile:dota-id:error",
            f"Не получилось открыть профиль: {escape(str(error))}",
            back_keyboard(return_screen),
            callback.message.chat.id,
        )
        return
    await state.clear()
    await state.set_state(DotaIdOnlyWizard.dota_id)
    await state.update_data(return_screen=return_screen, current_dota_id=profile.get("dotaAccountId") or "")
    await edit_panel_content(
        callback.bot,
        storage,
        api,
        settings,
        callback.from_user.id,
        "profile:dota-id",
        standalone_dota_id_text(profile.get("dotaAccountId")),
        standalone_dota_id_keyboard(bool(profile.get("dotaAccountId"))),
        callback.message.chat.id,
        dota_id_guide_photo(),
    )


def standalone_dota_id_text(current_id: object, error: str | None = None) -> str:
    text = (
        "<b>Добавить Dota ID</b>\n\n"
        "Откройте свой профиль в Dota 2: ID — цифры справа от ника, как показано на скриншоте. "
        "Введите 8–10 цифр.\n\n"
        "Это необязательно — можно вернуться к поиску и добавить ID позже."
    )
    if current_id:
        text += f"\n\nСейчас указан: <code>{escape(str(current_id))}</code>"
    if error:
        text += f"\n\n{escape(error)}"
    return text


def standalone_dota_id_keyboard(has_current_id: bool = False) -> InlineKeyboardMarkup:
    label = "Оставить текущий ID" if has_current_id else "Пропустить пока"
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text=label, callback_data="profile:dota-id:skip")],
        ]
    )


@router.message(DotaIdOnlyWizard.dota_id, F.text & ~F.text.startswith("/"))
async def receive_standalone_dota_id(
    message: Message,
    state: FSMContext,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    value = (message.text or "").strip()
    data = await state.get_data()
    if not re.fullmatch(r"\d{8,10}", value):
        await edit_panel_content(
            message.bot,
            storage,
            api,
            settings,
            message.from_user.id,
            "profile:dota-id",
            standalone_dota_id_text(data.get("current_dota_id"), "Введите 8–10 цифр без пробелов."),
            standalone_dota_id_keyboard(bool(data.get("current_dota_id"))),
            message.chat.id,
            dota_id_guide_photo(),
        )
        return
    try:
        await api.user(message.from_user.id, "PATCH", "/dota/profiles/me", {"dotaAccountId": value})
    except ApiError as error:
        await edit_panel_content(
            message.bot,
            storage,
            api,
            settings,
            message.from_user.id,
            "profile:dota-id",
            standalone_dota_id_text(data.get("current_dota_id"), str(error)),
            standalone_dota_id_keyboard(bool(data.get("current_dota_id"))),
            message.chat.id,
            dota_id_guide_photo(),
        )
        return
    await state.clear()
    await edit_panel(
        message.bot,
        storage,
        api,
        settings,
        message.from_user.id,
        str(data.get("return_screen") or "profile"),
    )


@router.callback_query(F.data == "profile:dota-id:skip")
async def skip_standalone_dota_id(
    callback: CallbackQuery,
    state: FSMContext,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    data = await state.get_data()
    if await state.get_state() != DotaIdOnlyWizard.dota_id.state:
        acknowledge_callback(callback)
        return
    acknowledge_callback(callback, "Возвращаюсь к поиску")
    await state.clear()
    await edit_panel(
        callback.bot,
        storage,
        api,
        settings,
        callback.from_user.id,
        str(data.get("return_screen") or "profile"),
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
            f"<b>{'Изменение профиля' if editing else 'Создание Dota-профиля'} · 3/4</b>\n\nНужен MMR числом от 0 до 18000. Напишите значение ещё раз.",
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
    acknowledge_callback(callback)
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
    acknowledge_callback(callback, "Регистрация отменена")
    await begin_panel_transition(callback.bot, storage, callback.from_user.id, callback.message.chat.id if callback.message else None)
    data = await state.get_data()
    await state.clear()
    storage.set_choices(callback.from_user.id, "pending_onboarding_action", [])
    await edit_panel(
        callback.bot,
        storage,
        api,
        settings,
        callback.from_user.id,
        "profile" if data.get("editing_profile") else "home",
    )


async def continue_after_profile_saved(
    bot,
    state: FSMContext,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
    telegram_user_id: int,
    chat_id: int | None,
    data: dict,
    match_wakeup: asyncio.Event,
) -> None:
    await state.clear()
    if data.get("editing_profile"):
        await edit_panel(bot, storage, api, settings, telegram_user_id, "profile", chat_id)
        return

    invite_code = data.get("party_invite_code")
    invite_role = data.get("party_invite_role")
    if invite_code and invite_role in POSITION_NAMES:
        from .party_links import finish_party_join

        await finish_party_join(
            bot,
            api,
            settings,
            storage,
            telegram_user_id,
            chat_id,
            invite_code,
            invite_role,
        )
        return

    from .search import resume_pending_onboarding_action

    resumed = await resume_pending_onboarding_action(
        bot,
        state,
        api,
        settings,
        storage,
        telegram_user_id,
        chat_id,
        match_wakeup,
    )
    if not resumed:
        await edit_panel(bot, storage, api, settings, telegram_user_id, "home", chat_id)


@router.callback_query(F.data == "register:complete")
async def complete_registration(
    callback: CallbackQuery,
    state: FSMContext,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
    match_wakeup: asyncio.Event,
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

    acknowledge_callback(callback, "Сохраняю профиль…" if editing_profile else "Создаю профиль…")
    await begin_panel_transition(callback.bot, storage, callback.from_user.id, callback.message.chat.id if callback.message else None)
    telegram_link_pending = False
    try:
        profile = {
            "title": data["display_name"],
            "mmr": data["mmr"],
            "roles": roles,
        }
        if data.get("dota_account_id"):
            profile["dotaAccountId"] = data["dota_account_id"]
        if not editing_profile:
            profile["server"] = "EU"
        if editing_profile:
            await api.user(callback.from_user.id, "PATCH", "/dota/profiles/me", profile)
        elif storage.get_session(callback.from_user.id):
            await api.user(callback.from_user.id, "POST", "/dota/profiles", profile)
        else:
            created = await api.public("POST", "/dota/profiles/guest", profile)
            storage.record_funnel_event(callback.from_user.id, "account_created")
            storage.save_session(
                callback.from_user.id,
                created["accessToken"],
                created["refreshToken"],
                created["recoveryUrl"],
            )
            telegram_link_pending = True
            await api.ensure_telegram_link(callback.from_user.id)
            telegram_link_pending = False
        await continue_after_profile_saved(
            callback.bot,
            state,
            api,
            settings,
            storage,
            callback.from_user.id,
            callback.message.chat.id if callback.message else None,
            data,
            match_wakeup,
        )
    except ApiError as error:
        if telegram_link_pending:
            await state.update_data(**data)
            await edit_panel_content(
                callback.bot,
                storage,
                api,
                settings,
                callback.from_user.id,
                "register:telegram-link-error",
                "<b>Аккаунт создан, осталось подключить Telegram.</b>\n\n"
                f"Не удалось завершить подключение: {escape(str(error))}.\n\nПопробуйте ещё раз.",
                telegram_link_retry_keyboard(),
                callback.message.chat.id if callback.message else None,
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
    text = f"<b>{title} · 4/4</b>\n\nВыберите позиции кнопками ниже. Можно выбрать несколько."
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
