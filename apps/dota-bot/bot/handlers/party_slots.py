from urllib.parse import quote

from aiogram import F, Router
from aiogram.types import CallbackQuery

from ..api.client import ApiError, OpiniaApi
from ..config import Settings
from ..services.panel import begin_panel_transition, edit_panel
from ..storage.database import BotStorage
from ..ui.keyboards import party_slot_occupants
from .search import show_candidates, show_error

router = Router(name="party-slots")


def current_party(response: dict) -> dict | None:
    return response.get("party") or ((response.get("parties") or [None])[-1])


def return_screen(storage: BotStorage, telegram_user_id: int, party_slug: str) -> str:
    search = storage.get_choice(telegram_user_id, "auto_search", 0) or {}
    if search.get("mode") == "recruit" and search.get("partySlug") == party_slug:
        return "recruiting"
    return "party"


@router.callback_query(F.data.startswith("party:noop:"))
async def occupied_search_slot(callback: CallbackQuery) -> None:
    await callback.answer("Этот слот уже занят", show_alert=True)


@router.callback_query(F.data.startswith("party:slot:"))
async def open_or_claim_slot(
    callback: CallbackQuery,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    role = (callback.data or "").rsplit(":", 1)[-1]
    if role not in {"1", "2", "3", "4", "5"}:
        await callback.answer("Позиция не найдена", show_alert=True)
        return

    await callback.answer()
    await begin_panel_transition(
        callback.bot, storage, callback.from_user.id,
        callback.message.chat.id if callback.message else None,
    )
    try:
        parties = await api.user(callback.from_user.id, "GET", "/social/parties/me")
        party = current_party(parties)
        if not party:
            await edit_panel(callback.bot, storage, api, settings, callback.from_user.id, "home")
            return

        member = next(
            (item for item in party.get("members", []) if str(item.get("positionRole") or "") == role),
            None,
        )
        if member:
            storage.set_choices(callback.from_user.id, "selected_party_member", [member])
            await edit_panel(callback.bot, storage, api, settings, callback.from_user.id, "member")
            return

        slug = quote(str(party["slug"]), safe="")
        await api.user(
            callback.from_user.id,
            "PATCH",
            f"/social/parties/{slug}/members/me/position",
            {"positionRole": role},
        )
        await edit_panel(
            callback.bot, storage, api, settings, callback.from_user.id,
            return_screen(storage, callback.from_user.id, party["slug"]),
        )
    except ApiError as error:
        await show_error(callback, api, settings, storage, error)


@router.callback_query(F.data.startswith("party:search:"))
async def search_for_party_slot(
    callback: CallbackQuery,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    role = (callback.data or "").rsplit(":", 1)[-1]
    if role not in {"1", "2", "3", "4", "5"}:
        await callback.answer("Позиция не найдена", show_alert=True)
        return

    await callback.answer("Ищу игроков на эту позицию")
    await begin_panel_transition(
        callback.bot, storage, callback.from_user.id,
        callback.message.chat.id if callback.message else None,
    )
    try:
        parties = await api.user(callback.from_user.id, "GET", "/social/parties/me")
        party = current_party(parties)
        if not party or not party.get("canManageParty"):
            await edit_panel(callback.bot, storage, api, settings, callback.from_user.id, "party")
            return
        occupants = party_slot_occupants(party)
        if role in occupants:
            await edit_panel(callback.bot, storage, api, settings, callback.from_user.id, "party")
            return
        screen = return_screen(storage, callback.from_user.id, party["slug"])
        await show_candidates(callback, api, settings, storage, "recruit", role, screen)
    except ApiError as error:
        await show_error(callback, api, settings, storage, error)


@router.callback_query(F.data.startswith("party:kick:confirm:"))
async def confirm_kick_member(
    callback: CallbackQuery,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    user_id = (callback.data or "").rsplit(":", 1)[-1]
    await callback.answer()
    storage.set_choices(callback.from_user.id, "selected_party_member", [{"userId": user_id}])
    await begin_panel_transition(
        callback.bot, storage, callback.from_user.id,
        callback.message.chat.id if callback.message else None,
    )
    await edit_panel(callback.bot, storage, api, settings, callback.from_user.id, "kick_confirm")


@router.callback_query(F.data.startswith("party:kick:execute:"))
async def kick_party_member(
    callback: CallbackQuery,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    user_id = (callback.data or "").rsplit(":", 1)[-1]
    await callback.answer("Удаляю игрока из пати")
    await begin_panel_transition(
        callback.bot, storage, callback.from_user.id,
        callback.message.chat.id if callback.message else None,
    )
    try:
        parties = await api.user(callback.from_user.id, "GET", "/social/parties/me")
        party = current_party(parties)
        if not party:
            await edit_panel(callback.bot, storage, api, settings, callback.from_user.id, "home")
            return
        slug = quote(str(party["slug"]), safe="")
        target = quote(user_id, safe="")
        await api.user(callback.from_user.id, "DELETE", f"/social/parties/{slug}/members/{target}")
        storage.set_choices(callback.from_user.id, "selected_party_member", [])
        await edit_panel(
            callback.bot, storage, api, settings, callback.from_user.id,
            return_screen(storage, callback.from_user.id, party["slug"]),
        )
    except ApiError as error:
        await show_error(callback, api, settings, storage, error)

