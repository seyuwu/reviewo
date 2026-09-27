import asyncio
import time
from html import escape
from random import choice
from urllib.parse import quote

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery

from ..api.client import ApiError, OpiniaApi
from ..config import Settings
from ..services.panel import begin_panel_transition, edit_panel, edit_panel_content
from ..services.solo_search import PartyOwnerMustResolveMembers, start_solo_search
from ..storage.database import BotStorage
from ..ui.keyboards import back_keyboard, onboarding_keyboard

router = Router(name="search")
ROLE_NAMES = {"1": "Керри", "2": "Мид", "3": "Оффлейн", "4": "Саппорт", "5": "Хард-саппорт"}


@router.callback_query(F.data == "search:looking")
async def start_looking(
    callback: CallbackQuery,
    state: FSMContext,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
    match_wakeup: asyncio.Event,
) -> None:
    await callback.answer()
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
    await callback.answer()
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
        await api.user(telegram_user_id, "GET", "/dota/profiles/me")
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
        await execute_looking(bot, api, settings, storage, telegram_user_id, chat_id, match_wakeup)
    elif action == "recruit":
        await execute_recruiting(bot, api, settings, storage, telegram_user_id, chat_id, match_wakeup)


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
        await api.user(telegram_user_id, "GET", "/dota/profiles/me")
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
        await execute_looking(bot, api, settings, storage, telegram_user_id, chat_id, match_wakeup)
    else:
        await execute_recruiting(bot, api, settings, storage, telegram_user_id, chat_id, match_wakeup)
    return True


async def execute_looking(
    bot,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
    telegram_user_id: int,
    chat_id: int | None,
    match_wakeup: asyncio.Event,
) -> None:
    await begin_panel_transition(bot, storage, telegram_user_id, chat_id)
    try:
        await start_solo_search(api, telegram_user_id)
        storage.clear_auto_match_exclusions(telegram_user_id)
        storage.set_choices(
            telegram_user_id,
            "auto_search",
            [{"mode": "looking", "startedAt": time.time()}],
        )
        await edit_panel(bot, storage, api, settings, telegram_user_id, "looking", chat_id)
        match_wakeup.set()
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
    except ApiError as error:
        await show_action_error(bot, api, settings, storage, telegram_user_id, chat_id, error)


async def execute_recruiting(
    bot,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
    telegram_user_id: int,
    chat_id: int | None,
    match_wakeup: asyncio.Event,
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
        occupants = {
            str(member.get("positionRole"))
            for member in party.get("members", [])
            if member.get("positionRole")
        }
        open_roles = sorted(role_values - occupants)
        await api.user(
            telegram_user_id,
            "POST",
            "/dota/profiles/lfg/looking",
            {"looking": True, "partySlug": party["slug"], "recruitedRoles": open_roles},
        )
        storage.clear_auto_match_exclusions(telegram_user_id)
        storage.set_choices(
            telegram_user_id,
            "auto_search",
            [{"mode": "recruit", "partySlug": party["slug"], "roles": open_roles, "startedAt": time.time()}],
        )
        await edit_panel(bot, storage, api, settings, telegram_user_id, "party", chat_id)
        if open_roles:
            match_wakeup.set()
    except ApiError as error:
        await show_action_error(bot, api, settings, storage, telegram_user_id, chat_id, error)


@router.callback_query(F.data == "search:stop")
async def stop_search(
    callback: CallbackQuery,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    await callback.answer()
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
