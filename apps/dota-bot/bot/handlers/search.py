from html import escape
from urllib.parse import quote

from aiogram import F, Router
from aiogram.types import CallbackQuery

from ..api.client import ApiError, OpiniaApi
from ..config import Settings
from ..services.panel import begin_panel_transition, edit_panel, edit_panel_content
from ..storage.database import BotStorage
from ..ui.keyboards import back_keyboard

router = Router(name="search")


@router.callback_query(F.data == "search:looking")
async def start_looking(
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
        if party:
            await edit_panel(callback.bot, storage, api, settings, callback.from_user.id, "party")
            return

        await api.user(
            callback.from_user.id,
            "POST",
            "/dota/profiles/lfg/looking",
            {"looking": True},
        )
        storage.clear_auto_match_exclusions(callback.from_user.id)
        storage.set_choices(callback.from_user.id, "auto_search", [{"mode": "looking"}])
        await edit_panel(callback.bot, storage, api, settings, callback.from_user.id, "looking")
    except ApiError as error:
        await show_error(callback, api, settings, storage, error)


@router.callback_query(F.data == "search:recruit")
@router.callback_query(F.data == "recruit:start")
async def begin_recruiting(
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
        if not party:
            party = await api.user(
                callback.from_user.id,
                "POST",
                "/social/parties",
                {"kind": "PARTY"},
            )

        slug = quote(str(party["slug"]), safe="")
        await api.user(
            callback.from_user.id,
            "PATCH",
            f"/social/parties/{slug}/join-mode",
            {"joinMode": "OPEN"},
        )
        # Omitting recruitedRoles means all currently unfilled positions.
        await api.user(
            callback.from_user.id,
            "POST",
            "/dota/profiles/lfg/looking",
            {"looking": True, "partySlug": party["slug"]},
        )
        storage.clear_auto_match_exclusions(callback.from_user.id)
        storage.set_choices(
            callback.from_user.id,
            "auto_search",
            [{"mode": "recruit", "partySlug": party["slug"], "roles": []}],
        )
        await edit_panel(callback.bot, storage, api, settings, callback.from_user.id, "recruiting")
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
        await edit_panel(callback.bot, storage, api, settings, callback.from_user.id, "home")
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
