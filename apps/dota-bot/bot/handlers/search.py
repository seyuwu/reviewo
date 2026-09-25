import asyncio
from html import escape
from random import choice
from urllib.parse import quote

from aiogram import F, Router
from aiogram.types import CallbackQuery

from ..api.client import ApiError, OpiniaApi
from ..config import Settings
from ..services.panel import begin_panel_transition, edit_panel, edit_panel_content
from ..services.solo_search import PartyOwnerMustResolveMembers, start_solo_search
from ..storage.database import BotStorage
from ..ui.keyboards import back_keyboard

router = Router(name="search")


@router.callback_query(F.data == "search:looking")
async def start_looking(
    callback: CallbackQuery,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
    match_wakeup: asyncio.Event,
) -> None:
    await callback.answer()
    await begin_panel_transition(
        callback.bot,
        storage,
        callback.from_user.id,
        callback.message.chat.id if callback.message else None,
    )
    try:
        await start_solo_search(api, callback.from_user.id)
        storage.clear_auto_match_exclusions(callback.from_user.id)
        storage.set_choices(callback.from_user.id, "auto_search", [{"mode": "looking"}])
        await edit_panel(callback.bot, storage, api, settings, callback.from_user.id, "looking")
        match_wakeup.set()
    except PartyOwnerMustResolveMembers:
        await edit_panel_content(
            callback.bot,
            storage,
            api,
            settings,
            callback.from_user.id,
            "notice",
            "Вы капитан пати с другими игроками. Чтобы искать новую пати, сначала завершите текущую: попросите игроков выйти или распустите её.",
            back_keyboard("party"),
        )
    except ApiError as error:
        await show_error(callback, api, settings, storage, error)


@router.callback_query(F.data == "search:recruit")
@router.callback_query(F.data == "recruit:start")
async def begin_recruiting(
    callback: CallbackQuery,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
    match_wakeup: asyncio.Event,
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
        if party:
            await edit_panel(callback.bot, storage, api, settings, callback.from_user.id, "party")
            return

        party = await api.user(
            callback.from_user.id,
            "POST",
            "/social/parties",
            {"kind": "PARTY"},
        )

        profile = await api.user(callback.from_user.id, "GET", "/dota/profiles/me")
        role_values = {"1", "2", "3", "4", "5"}
        profile_roles = sorted({str(role) for role in (profile.get("roles") or [])} & role_values)
        if profile_roles:
            await api.user(
                callback.from_user.id,
                "PATCH",
                f"/social/parties/{quote(str(party['slug']), safe='')}/members/me/position",
                {"positionRole": choice(profile_roles)},
            )
            my_parties = await api.user(callback.from_user.id, "GET", "/social/parties/me")
            party = my_parties.get("party") or party

        slug = quote(str(party["slug"]), safe="")
        await api.user(
            callback.from_user.id,
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
            callback.from_user.id,
            "POST",
            "/dota/profiles/lfg/looking",
            {"looking": True, "partySlug": party["slug"], "recruitedRoles": open_roles},
        )
        storage.clear_auto_match_exclusions(callback.from_user.id)
        storage.set_choices(
            callback.from_user.id,
            "auto_search",
            [{"mode": "recruit", "partySlug": party["slug"], "roles": open_roles}],
        )
        await edit_panel(callback.bot, storage, api, settings, callback.from_user.id, "party")
        if open_roles:
            match_wakeup.set()
    except ApiError as error:
        await show_error(callback, api, settings, storage, error)


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


async def show_error(
    callback: CallbackQuery,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
    error: ApiError,
) -> None:
    if callback.message is None:
        return
    await edit_panel_content(
        callback.bot,
        storage,
        api,
        settings,
        callback.from_user.id,
        "notice",
        f"<b>Не получилось выполнить действие</b>\n\n{escape(str(error))}",
        back_keyboard(),
        callback.message.chat.id,
    )
