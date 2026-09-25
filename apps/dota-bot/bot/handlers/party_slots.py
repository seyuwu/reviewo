from urllib.parse import quote

from aiogram import F, Router
from aiogram.types import CallbackQuery

from ..api.client import ApiError, OpiniaApi
from ..config import Settings
from ..services.panel import begin_panel_transition, edit_panel, edit_panel_content
from ..storage.database import BotStorage
from .search import show_error
from ..ui.keyboards import delete_party_confirmation_keyboard

router = Router(name="party-slots")


def current_party(response: dict) -> dict | None:
    return response.get("party") or ((response.get("parties") or [None])[-1])


def return_screen() -> str:
    return "party"


@router.callback_query(F.data.startswith("party:noop:"))
async def occupied_search_slot(callback: CallbackQuery) -> None:
    await callback.answer("Этот слот уже занят", show_alert=True)


@router.callback_query(F.data.startswith("party:searching:"))
async def already_searching_party_slot(callback: CallbackQuery) -> None:
    await callback.answer("Поиск игроков на эту позицию уже идёт")


@router.callback_query(F.data == "party:readonly")
async def readonly_party_search_status(callback: CallbackQuery) -> None:
    await callback.answer("Управлять подбором может капитан или офицер", show_alert=True)


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
            return_screen(),
        )
    except ApiError as error:
        await show_error(callback, api, settings, storage, error)


@router.callback_query(F.data.startswith("party:search:"))
async def search_for_party_slot(
    callback: CallbackQuery,
) -> None:
    await callback.answer("Ручной подбор отключён", show_alert=True)


@router.callback_query(F.data.startswith("party:toggle-search:"))
async def enable_search_for_party_slot(
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
        party = current_party(await api.user(callback.from_user.id, "GET", "/social/parties/me"))
        if not party:
            await edit_panel(callback.bot, storage, api, settings, callback.from_user.id, "home")
            return
        if not party.get("canManageParty"):
            await edit_panel(callback.bot, storage, api, settings, callback.from_user.id, "party")
            return
        if role in {str(member.get("positionRole")) for member in party.get("members", [])}:
            await edit_panel(callback.bot, storage, api, settings, callback.from_user.id, "party")
            return

        roles = set(map(str, party.get("recruitedRoles") or []))
        if role in roles:
            roles.remove(role)
        else:
            roles.add(role)
        slug = quote(str(party["slug"]), safe="")
        if roles:
            await api.user(
                callback.from_user.id,
                "PATCH",
                f"/social/parties/{slug}/join-mode",
                {"joinMode": "OPEN"},
            )
        await api.user(
            callback.from_user.id,
            "POST",
            "/dota/profiles/lfg/looking",
            {
                "looking": bool(roles),
                "partySlug": party["slug"],
                **({"recruitedRoles": sorted(roles)} if roles else {}),
            },
        )
        if roles:
            storage.set_choices(
                callback.from_user.id,
                "auto_search",
                [{"mode": "recruit", "partySlug": party["slug"], "roles": sorted(roles)}],
            )
        else:
            storage.set_choices(callback.from_user.id, "auto_search", [])
        await edit_panel(callback.bot, storage, api, settings, callback.from_user.id, "party")
    except ApiError as error:
        await show_error(callback, api, settings, storage, error)


@router.callback_query(F.data == "party:delete:confirm")
async def confirm_delete_party(
    callback: CallbackQuery,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    await callback.answer()
    await begin_panel_transition(
        callback.bot, storage, callback.from_user.id,
        callback.message.chat.id if callback.message else None,
    )
    try:
        party = current_party(await api.user(callback.from_user.id, "GET", "/social/parties/me"))
        if not party or not party.get("isOwner"):
            await edit_panel(callback.bot, storage, api, settings, callback.from_user.id, "party")
            return
        await edit_panel_content(
            callback.bot,
            storage,
            api,
            settings,
            callback.from_user.id,
            "notice",
            "<b>Удалить пати?</b>\n\nВсе участники будут удалены из неё, а подбор остановится.",
            delete_party_confirmation_keyboard(),
        )
    except ApiError as error:
        await show_error(callback, api, settings, storage, error)


@router.callback_query(F.data == "party:delete:execute")
async def delete_party(
    callback: CallbackQuery,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    await callback.answer("Удаляю пати")
    await begin_panel_transition(
        callback.bot, storage, callback.from_user.id,
        callback.message.chat.id if callback.message else None,
    )
    try:
        party = current_party(await api.user(callback.from_user.id, "GET", "/social/parties/me"))
        if not party or not party.get("isOwner"):
            await edit_panel(callback.bot, storage, api, settings, callback.from_user.id, "home")
            return
        await api.user(
            callback.from_user.id,
            "DELETE",
            f"/social/parties/{quote(str(party['slug']), safe='')}",
        )
        storage.set_choices(callback.from_user.id, "auto_search", [])
        storage.clear_auto_match_exclusions(callback.from_user.id)
        await edit_panel(callback.bot, storage, api, settings, callback.from_user.id, "home")
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
            return_screen(),
        )
    except ApiError as error:
        await show_error(callback, api, settings, storage, error)

