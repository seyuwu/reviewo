import asyncio
import logging
import time
from html import escape
from random import choice
from urllib.parse import quote

from aiogram import F, Router
from aiogram.exceptions import TelegramAPIError
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup

from ..api.client import ApiError, OpiniaApi
from ..config import Settings
from ..services.callbacks import acknowledge_callback
from ..services.panel import begin_panel_transition, edit_panel, edit_panel_content
from ..services.party_search_queue import PartySearchQueue
from ..services.solo_search import (
    PartyChangedDuringConfirmation,
    PartyOwnerMustResolveMembers,
    start_solo_search,
)
from ..storage.database import BotStorage
from ..ui.keyboards import (
    back_keyboard,
    onboarding_keyboard,
    solo_search_confirmation_keyboard,
)

router = Router(name="search")
logger = logging.getLogger(__name__)


@router.callback_query(F.data == "search:looking")
async def start_looking(
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
    await start_selected_action(
        callback.bot,
        state,
        api,
        settings,
        storage,
        callback.from_user.id,
        callback.message.chat.id,
        "looking",
        match_wakeup,
    )


@router.callback_query(F.data == "search:looking:confirm")
async def confirm_start_looking(
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
    confirmation = storage.get_choice(callback.from_user.id, "pending_solo_search", 0)
    if not confirmation:
        await edit_panel(callback.bot, storage, api, settings, callback.from_user.id, "home")
        return
    await start_selected_action(
        callback.bot,
        state,
        api,
        settings,
        storage,
        callback.from_user.id,
        callback.message.chat.id,
        "looking",
        match_wakeup,
        confirmation=confirmation,
    )


@router.callback_query(F.data == "search:looking:cancel")
async def cancel_start_looking(
    callback: CallbackQuery,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    acknowledge_callback(callback, "Остаётесь в пати")
    storage.set_choices(callback.from_user.id, "pending_solo_search", [])
    try:
        memberships = await api.user(callback.from_user.id, "GET", "/social/parties/me")
        party = memberships.get("party") or ((memberships.get("parties") or [None])[-1])
        screen = "party" if party else "home"
    except ApiError:
        screen = "home"
    await edit_panel(
        callback.bot,
        storage,
        api,
        settings,
        callback.from_user.id,
        screen,
        callback.message.chat.id if callback.message else None,
    )


@router.callback_query(F.data == "search:recruit")
@router.callback_query(F.data == "recruit:start")
async def begin_recruiting(
    callback: CallbackQuery,
    state: FSMContext,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
    match_wakeup: asyncio.Event,
) -> None:
    if storage.get_choice(callback.from_user.id, "party_slot_search_tip_seen", 0) is None:
        storage.set_choices(
            callback.from_user.id,
            "party_slot_search_tip_seen",
            [{"seenAt": time.time()}],
        )
        acknowledge_callback(
            callback,
            "Поиск сам не начнётся: нажмите «Искать» под нужным слотом или «Искать на всех свободных».",
        )
    else:
        acknowledge_callback(callback)
    if callback.message is None:
        return
    await start_selected_action(
        callback.bot,
        state,
        api,
        settings,
        storage,
        callback.from_user.id,
        callback.message.chat.id,
        "recruit",
        match_wakeup,
    )


async def start_selected_action(
    bot,
    state: FSMContext,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
    telegram_user_id: int,
    chat_id: int,
    action: str,
    match_wakeup: asyncio.Event,
    confirmation: dict | None = None,
) -> None:
    if not storage.get_session(telegram_user_id):
        storage.set_choices(telegram_user_id, "pending_onboarding_action", [{"action": action}])
        await begin_panel_transition(bot, storage, telegram_user_id, chat_id)
        action_text = "искать вам подходящую пати" if action == "looking" else "собрать пати и подобрать игроков"
        await edit_panel_content(
            bot,
            storage,
            api,
            settings,
            telegram_user_id,
            "onboarding:auth",
            "<b>Осталось немного — давайте создадим аккаунт</b>\n\n"
            f"Аккаунт нужен, чтобы {action_text}. Создание профиля займёт всего несколько шагов.\n\n"
            "Если аккаунт Opinia уже есть, напишите <code>/login</code> для входа.",
            onboarding_keyboard(),
            chat_id,
        )
        return

    try:
        profile = await api.user(telegram_user_id, "GET", "/dota/profiles/me")
    except ApiError as error:
        if error.status == 404:
            storage.set_choices(telegram_user_id, "pending_onboarding_action", [{"action": action}])
            await begin_panel_transition(bot, storage, telegram_user_id, chat_id)
            from .registration import start_profile_registration

            await start_profile_registration(bot, state, api, settings, storage, telegram_user_id, chat_id)
            return
        await show_action_error(bot, api, settings, storage, telegram_user_id, chat_id, error)
        return

    storage.set_choices(telegram_user_id, "pending_onboarding_action", [])
    if action == "looking":
        await prepare_looking(
            bot,
            api,
            settings,
            storage,
            telegram_user_id,
            chat_id,
            match_wakeup,
            profile,
            confirmation,
        )
    elif action == "recruit":
        await execute_recruiting(bot, api, settings, storage, telegram_user_id, chat_id)


async def resume_pending_onboarding_action(
    bot,
    state: FSMContext,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
    telegram_user_id: int,
    chat_id: int | None,
    match_wakeup: asyncio.Event,
) -> bool:
    pending = storage.get_choice(telegram_user_id, "pending_onboarding_action", 0)
    action = str((pending or {}).get("action") or "")
    if action not in {"looking", "recruit"}:
        return False

    try:
        profile = await api.user(telegram_user_id, "GET", "/dota/profiles/me")
    except ApiError as error:
        if error.status == 404:
            from .registration import start_profile_registration

            await start_profile_registration(
                bot, state, api, settings, storage, telegram_user_id, chat_id
            )
            return True
        await show_action_error(
            bot, api, settings, storage, telegram_user_id, chat_id, error
        )
        return True

    storage.set_choices(telegram_user_id, "pending_onboarding_action", [])
    if action == "looking":
        await prepare_looking(
            bot,
            api,
            settings,
            storage,
            telegram_user_id,
            chat_id,
            match_wakeup,
            profile,
        )
    else:
        await execute_recruiting(bot, api, settings, storage, telegram_user_id, chat_id)
    return True


async def prepare_looking(
    bot,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
    telegram_user_id: int,
    chat_id: int | None,
    match_wakeup: asyncio.Event,
    profile: dict,
    confirmation: dict | None = None,
) -> None:
    try:
        memberships = await api.user(telegram_user_id, "GET", "/social/parties/me")
    except ApiError as error:
        await show_action_error(bot, api, settings, storage, telegram_user_id, chat_id, error)
        return

    party = memberships.get("party") or ((memberships.get("parties") or [None])[-1])
    confirmed_party = None
    if party:
        now = time.time()
        expected_party = {
            "partySlug": str(party.get("slug") or ""),
            "isOwner": bool(party.get("isOwner")),
            "expiresAt": now + 600,
        }
        confirmation_is_current = bool(
            confirmation
            and float(confirmation.get("expiresAt") or 0) > now
            and str(confirmation.get("partySlug") or "") == expected_party["partySlug"]
            and bool(confirmation.get("isOwner")) == expected_party["isOwner"]
        )
        if not confirmation_is_current:
            storage.set_choices(telegram_user_id, "pending_solo_search", [expected_party])
            party_name = escape(str(party.get("name") or "Моя пати"))
            if party.get("isOwner"):
                warning = (
                    f"Пати <b>«{party_name}»</b> будет удалена у всех участников, "
                    "а затем начнётся ваш поиск новой пати."
                )
            else:
                warning = (
                    f"Вы выйдете из пати <b>«{party_name}»</b>; остальные участники останутся. "
                    "После этого начнётся ваш поиск новой пати."
                )
            await begin_panel_transition(bot, storage, telegram_user_id, chat_id)
            await edit_panel_content(
                bot,
                storage,
                api,
                settings,
                telegram_user_id,
                "search:looking:confirm",
                f"<b>Начать поиск пати?</b>\n\n{warning}\n\nПродолжить?",
                solo_search_confirmation_keyboard(),
                chat_id,
            )
            return
        confirmed_party = confirmation
    else:
        storage.set_choices(telegram_user_id, "pending_solo_search", [])

    await execute_looking(
        bot,
        api,
        settings,
        storage,
        telegram_user_id,
        chat_id,
        match_wakeup,
        profile,
        confirmed_party,
    )


async def execute_looking(
    bot,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
    telegram_user_id: int,
    chat_id: int | None,
    match_wakeup: asyncio.Event,
    profile: dict,
    confirmed_party: dict | None = None,
) -> None:
    await begin_panel_transition(bot, storage, telegram_user_id, chat_id)
    try:
        await start_solo_search(api, telegram_user_id, confirmed_party=confirmed_party)
        storage.record_search_started(telegram_user_id)
        storage.set_choices(telegram_user_id, "pending_solo_search", [])
        storage.clear_auto_match_exclusions(telegram_user_id)
        storage.set_choices(
            telegram_user_id,
            "auto_search",
            [{"mode": "looking", "startedAt": time.time()}],
        )
        await edit_panel(bot, storage, api, settings, telegram_user_id, "looking", chat_id)
        match_wakeup.set()
        if not profile.get("dotaAccountId"):
            await send_dota_id_reminder(bot, storage, telegram_user_id, chat_id)
        else:
            await send_roles_reminder(bot, storage, telegram_user_id, chat_id)
    except PartyOwnerMustResolveMembers:
        await edit_panel_content(
            bot,
            storage,
            api,
            settings,
            telegram_user_id,
            "notice",
            "Вы капитан пати с другими игроками. Чтобы искать новую пати, сначала завершите текущую: попросите игроков выйти или распустите её.",
            back_keyboard("party"),
            chat_id,
        )
    except PartyChangedDuringConfirmation:
        storage.set_choices(telegram_user_id, "pending_solo_search", [])
        await prepare_looking(
            bot,
            api,
            settings,
            storage,
            telegram_user_id,
            chat_id,
            match_wakeup,
            profile,
        )
    except ApiError as error:
        await show_action_error(bot, api, settings, storage, telegram_user_id, chat_id, error)


async def execute_recruiting(
    bot,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
    telegram_user_id: int,
    chat_id: int | None,
) -> None:
    await begin_panel_transition(bot, storage, telegram_user_id, chat_id)
    try:
        my_parties = await api.user(telegram_user_id, "GET", "/social/parties/me")
        party = my_parties.get("party") or ((my_parties.get("parties") or [None])[-1])
        if party:
            await edit_panel(bot, storage, api, settings, telegram_user_id, "party", chat_id)
            return

        party = await api.user(
            telegram_user_id,
            "POST",
            "/social/parties",
            {"kind": "PARTY"},
        )
        storage.clear_search_timer(telegram_user_id)
        storage.record_party_created(telegram_user_id)

        profile = await api.user(telegram_user_id, "GET", "/dota/profiles/me")
        role_values = {"1", "2", "3", "4", "5"}
        profile_roles = sorted({str(role) for role in (profile.get("roles") or [])} & role_values)
        if profile_roles:
            await api.user(
                telegram_user_id,
                "PATCH",
                f"/social/parties/{quote(str(party['slug']), safe='')}/members/me/position",
                {"positionRole": choice(profile_roles)},
            )
            my_parties = await api.user(telegram_user_id, "GET", "/social/parties/me")
            party = my_parties.get("party") or party

        slug = quote(str(party["slug"]), safe="")
        await api.user(
            telegram_user_id,
            "PATCH",
            f"/social/parties/{slug}/join-mode",
            {"joinMode": "OPEN"},
        )
        storage.set_choices(telegram_user_id, "auto_search", [])
        storage.clear_auto_match_exclusions(telegram_user_id)
        await edit_panel(bot, storage, api, settings, telegram_user_id, "party", chat_id)
    except ApiError as error:
        await show_action_error(bot, api, settings, storage, telegram_user_id, chat_id, error)


@router.callback_query(F.data == "search:stop")
async def stop_search(
    callback: CallbackQuery,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
    party_search_queue: PartySearchQueue,
) -> None:
    acknowledge_callback(callback)
    panel = storage.get_panel(callback.from_user.id)
    if panel and panel.screen == "party":
        message = callback.message
        await party_search_queue.enqueue(
            callback.from_user.id,
            message.chat.id if message else callback.from_user.id,
            "stop",
            message_id=message.message_id if message else None,
            markup=getattr(message, "reply_markup", None) if message else None,
        )
        return
    await begin_panel_transition(
        callback.bot,
        storage,
        callback.from_user.id,
        callback.message.chat.id if callback.message else None,
    )
    try:
        my_parties = await api.user(callback.from_user.id, "GET", "/social/parties/me")
        party = my_parties.get("party") or ((my_parties.get("parties") or [None])[-1])
        payload = {"looking": False}
        if party:
            payload["partySlug"] = party["slug"]
        await api.user(callback.from_user.id, "POST", "/dota/profiles/lfg/looking", payload)
        storage.set_choices(callback.from_user.id, "auto_search", [])
        storage.clear_search_timer(callback.from_user.id)
        storage.clear_auto_match_exclusions(callback.from_user.id)
        screen = "party" if party else "home"
        await edit_panel(callback.bot, storage, api, settings, callback.from_user.id, screen)
    except ApiError as error:
        await show_error(callback, api, settings, storage, error)


@router.callback_query(F.data.startswith("recruit:toggle:"))
@router.callback_query(F.data.startswith("recruit:slot:"))
@router.callback_query(F.data == "search:list")
@router.callback_query(F.data.startswith("candidate:"))
async def disable_manual_matching(callback: CallbackQuery) -> None:
    await callback.answer("Игроки подбираются автоматически", show_alert=True)


async def show_action_error(
    bot,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
    telegram_user_id: int,
    chat_id: int | None,
    error: ApiError,
) -> None:
    await edit_panel_content(
        bot,
        storage,
        api,
        settings,
        telegram_user_id,
        "notice",
        f"<b>Не получилось выполнить действие</b>\n\n{escape(str(error))}",
        back_keyboard(),
        chat_id,
    )


async def send_dota_id_reminder(bot, storage, telegram_user_id: int, chat_id: int | None) -> None:
    try:
        message = await bot.send_message(
            chat_id or telegram_user_id,
            "🎮 Dota ID не указан. Нажмите кнопку, чтобы сразу ввести его. "
            "Это необязательно; уведомление исчезнет через 10 секунд.",
            reply_markup=InlineKeyboardMarkup(
                inline_keyboard=[
                    [InlineKeyboardButton(text="🎮 Добавить Dota ID", callback_data="profile:dota-id")]
                ]
            ),
        )
        storage.add_temporary_message(telegram_user_id, message.chat.id, message.message_id, 10)
    except TelegramAPIError:
        logger.warning("Could not send Dota ID reminder to Telegram user %s", telegram_user_id)


async def send_roles_reminder(bot, storage, telegram_user_id: int, chat_id: int | None) -> None:
    try:
        message = await bot.send_message(
            chat_id or telegram_user_id,
            "🎯 Проверьте, все ли игровые позиции указаны в профиле: автоподбор ищет пати по ним. "
            "Изменить позиции можно в «Аккаунт» → «Профиль» → «Изменить». "
            "Это уведомление исчезнет через 10 секунд.",
        )
        storage.add_temporary_message(telegram_user_id, message.chat.id, message.message_id, 10)
    except TelegramAPIError:
        logger.warning("Could not send role reminder to Telegram user %s", telegram_user_id)


async def show_error(
    callback: CallbackQuery,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
    error: ApiError,
) -> None:
    if callback.message is None:
        return
    await show_action_error(
        callback.bot,
        api,
        settings,
        storage,
        callback.from_user.id,
        callback.message.chat.id,
        error,
    )
