import asyncio
import logging
import time
from html import escape
from random import choice
from urllib.parse import quote

from aiogram import F, Router
from aiogram.exceptions import TelegramAPIError, TelegramBadRequest
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup

from ..api.client import ApiError, OpiniaApi
from ..config import Settings
from ..services.callbacks import acknowledge_callback
from ..services.panel import begin_panel_transition, edit_panel, edit_panel_content
from ..services.party_search_queue import PartySearchQueue
from ..services.search_timeout_notices import NOTICE_DELETE_CALLBACK, queue_solo_stop
from ..services.solo_search import (
    PartyChangedDuringConfirmation,
    PartyOwnerMustResolveMembers,
    start_solo_search,
)
from ..services.temporary_notifications import send_temporary_notification
from ..storage.database import BotStorage
from ..ui.keyboards import (
    back_keyboard,
    solo_search_confirmation_keyboard,
)

router = Router(name="search")
logger = logging.getLogger(__name__)
_party_search_tip_locks: dict[int, asyncio.Lock] = {}


@router.callback_query(F.data == NOTICE_DELETE_CALLBACK)
async def delete_search_notice(callback: CallbackQuery, storage: BotStorage) -> None:
    message = callback.message
    if (message is None or message.chat.type != "private"
            or message.chat.id != callback.from_user.id):
        acknowledge_callback(callback, "Эта кнопка доступна только получателю сообщения.")
        return
    if not storage.is_temporary_message(message.chat.id, message.message_id):
        acknowledge_callback(callback, "Сообщение уже удалено.")
        return
    try:
        await callback.bot.delete_message(message.chat.id, message.message_id)
    except TelegramBadRequest as error:
        if "message to delete not found" not in str(error).lower():
            acknowledge_callback(callback, "Не получилось удалить сообщение. Попробуй ещё раз.")
            return
    except TelegramAPIError:
        acknowledge_callback(callback, "Не получилось удалить сообщение. Попробуй ещё раз.")
        return
    # Retain the lifetime notice quota; remove only this message's deletion timer.
    storage.remove_temporary_message(message.chat.id, message.message_id)
    acknowledge_callback(callback, "Сообщение удалено.")


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
        telegram_name=callback.from_user.username or callback.from_user.full_name,
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
        telegram_name=callback.from_user.username or callback.from_user.full_name,
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
    if storage.get_choice(callback.from_user.id, "party_slot_search_tip_message_sent", 0) is None:
        storage.set_choices(
            callback.from_user.id,
            "party_slot_search_tip_message_pending",
            [{"requestedAt": time.time()}],
        )
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
        telegram_name=callback.from_user.username or callback.from_user.full_name,
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
    *,
    telegram_name: str | None = None,
) -> None:
    if not storage.get_session(telegram_user_id):
        storage.set_choices(telegram_user_id, "pending_onboarding_action", [{"action": action}])
        await begin_panel_transition(bot, storage, telegram_user_id, chat_id)
        from .registration import start_profile_registration

        await start_profile_registration(
            bot, state, api, settings, storage, telegram_user_id, chat_id, telegram_name=telegram_name
        )
        return

    try:
        profile = await api.user(telegram_user_id, "GET", "/dota/profiles/me")
    except ApiError as error:
        if error.status == 404:
            storage.set_choices(telegram_user_id, "pending_onboarding_action", [{"action": action}])
            await begin_panel_transition(bot, storage, telegram_user_id, chat_id)
            from .registration import start_profile_registration

            await start_profile_registration(
                bot, state, api, settings, storage, telegram_user_id, chat_id, telegram_name=telegram_name
            )
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
    previous_search = storage.get_choice(telegram_user_id, "auto_search", 0)
    restore_search_on_failure = bool(
        previous_search and previous_search.get("mode") == "looking"
    )
    # Stop the solo matcher before any network wait. It may already be checking
    # this user and otherwise redraw a stale home/party panel over this action.
    storage.set_choices(telegram_user_id, "auto_search", [])
    party_created = False
    try:
        await begin_panel_transition(bot, storage, telegram_user_id, chat_id)
    except Exception:
        if restore_search_on_failure:
            storage.set_choices(telegram_user_id, "auto_search", [previous_search])
        raise

    try:
        my_parties = await api.user(telegram_user_id, "GET", "/social/parties/me")
        party = my_parties.get("party") or ((my_parties.get("parties") or [None])[-1])
        if party:
            storage.clear_auto_match_exclusions(telegram_user_id)
            storage.clear_search_timer(telegram_user_id)
            await edit_panel(bot, storage, api, settings, telegram_user_id, "party", chat_id)
            await send_party_search_tip_if_pending(bot, storage, telegram_user_id, chat_id)
            return

        party = await api.user(
            telegram_user_id,
            "POST",
            "/social/parties",
            {"kind": "PARTY"},
        )
        party_created = True
        # Party creation clears the server-side solo-search flag too.
        storage.clear_auto_match_exclusions(telegram_user_id)
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
        await edit_panel(bot, storage, api, settings, telegram_user_id, "party", chat_id)
        await send_party_search_tip_if_pending(bot, storage, telegram_user_id, chat_id)
    except ApiError as error:
        if restore_search_on_failure and not party_created:
            storage.set_choices(telegram_user_id, "auto_search", [previous_search])
        await show_action_error(bot, api, settings, storage, telegram_user_id, chat_id, error)
    except Exception:
        if restore_search_on_failure and not party_created:
            storage.set_choices(telegram_user_id, "auto_search", [previous_search])
        raise


async def send_party_search_tip_if_pending(
    bot,
    storage,
    telegram_user_id: int,
    chat_id: int | None,
) -> None:
    lock = _party_search_tip_locks.setdefault(telegram_user_id, asyncio.Lock())
    async with lock:
        if (
            storage.get_choice(telegram_user_id, "party_slot_search_tip_message_sent", 0)
            is not None
            or storage.get_choice(
                telegram_user_id, "party_slot_search_tip_message_pending", 0
            )
            is None
        ):
            return

        try:
            await send_temporary_notification(
                bot,
                storage,
                telegram_user_id,
                chat_id or telegram_user_id,
                "ℹ️ <b>Как запустить поиск игроков</b>\n\n"
                "Создание пати не запускает поиск автоматически. Нажмите «Искать» под нужной свободной ролью, "
                "чтобы искать игрока на неё. Или нажмите «🔎 Искать на всех свободных», "
                "чтобы искать сразу на все свободные роли.",
                7,
                parse_mode="HTML",
                disable_web_page_preview=True,
            )
        except TelegramAPIError:
            logger.warning("Could not send party search tip to Telegram user %s", telegram_user_id)
            return

        storage.set_choices(
            telegram_user_id,
            "party_slot_search_tip_message_sent",
            [{"sentAt": time.time()}],
        )
        storage.set_choices(telegram_user_id, "party_slot_search_tip_message_pending", [])


@router.callback_query(F.data == "search:all_roles")
async def search_all_roles(
    callback: CallbackQuery,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
    match_wakeup: asyncio.Event,
) -> None:
    acknowledge_callback(callback)
    user_id = callback.from_user.id
    panel = storage.get_panel(user_id)
    search = storage.get_choice(user_id, "auto_search", 0) or {}
    if (
        not callback.message
        or not panel
        or panel.screen != "looking"
        or panel.message_id != callback.message.message_id
        or search.get("mode") != "looking"
    ):
        return
    try:
        await api.user(user_id, "PATCH", "/dota/profiles/lfg/roles", {"allRoles": True})
        current = storage.get_choice(user_id, "auto_search", 0) or {}
        panel = storage.get_panel(user_id)
        if (
            current != search
            or not panel
            or panel.screen != "looking"
            or panel.message_id != callback.message.message_id
        ):
            return
        storage.clear_auto_match_exclusions(user_id)
        await edit_panel(callback.bot, storage, api, settings, user_id, "looking")
        match_wakeup.set()
    except ApiError as error:
        panel = storage.get_panel(user_id)
        if (
            not panel
            or panel.screen != "looking"
            or panel.message_id != callback.message.message_id
            or storage.get_choice(user_id, "auto_search", 0) != search
        ):
            return
        if error.status == 409:
            # Search expired or a concurrent matcher already filled a party.
            # Let the regular panel refresh show that state, without restarting.
            await edit_panel(callback.bot, storage, api, settings, user_id, "looking")
            match_wakeup.set()
            return
        await show_error(callback, api, settings, storage, error)


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
    if panel and panel.screen in {"party", "party_settings"}:
        message = callback.message
        await party_search_queue.enqueue(
            callback.from_user.id,
            message.chat.id if message else callback.from_user.id,
            "stop",
            message_id=message.message_id if message else None,
            markup=getattr(message, "reply_markup", None) if message and panel.screen == "party" else None,
        )
        return
    search = storage.get_choice(callback.from_user.id, "auto_search", 0) or {}
    await begin_panel_transition(
        callback.bot,
        storage,
        callback.from_user.id,
        callback.message.chat.id if callback.message else None,
    )
    try:
        my_parties = await api.user(callback.from_user.id, "GET", "/social/parties/me")
        current = storage.get_choice(callback.from_user.id, "auto_search", 0) or {}
        if current and current != search:
            return
        party = my_parties.get("party") or ((my_parties.get("parties") or [None])[-1])
        payload = {"looking": False}
        if party:
            payload["partySlug"] = party["slug"]
        profile = await api.user(callback.from_user.id, "POST", "/dota/profiles/lfg/looking", payload)
        queue_solo_stop(storage, callback.from_user.id, search, profile, my_parties)
        current = storage.get_choice(callback.from_user.id, "auto_search", 0) or {}
        if current and current != search:
            return
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
        await send_temporary_notification(
            bot,
            storage,
            telegram_user_id,
            chat_id or telegram_user_id,
            "🎮 Dota ID не указан. Нажмите кнопку, чтобы сразу ввести его. "
            "Это необязательно; уведомление исчезнет через 10 секунд.",
            10,
            reply_markup=InlineKeyboardMarkup(
                inline_keyboard=[
                    [InlineKeyboardButton(text="🎮 Добавить Dota ID", callback_data="profile:dota-id")]
                ]
            ),
        )
    except TelegramAPIError:
        logger.warning("Could not send Dota ID reminder to Telegram user %s", telegram_user_id)


async def send_roles_reminder(bot, storage, telegram_user_id: int, chat_id: int | None) -> None:
    try:
        await send_temporary_notification(
            bot,
            storage,
            telegram_user_id,
            chat_id or telegram_user_id,
            "🎯 Проверьте, все ли игровые позиции указаны в профиле: автоподбор ищет пати по ним. "
            "Если готовы играть на любой позиции, нажмите «Поиск по всем ролям» в окне поиска. "
            "Это уведомление исчезнет через 10 секунд.",
            10,
        )
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
