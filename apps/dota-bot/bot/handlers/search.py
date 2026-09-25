from urllib.parse import urlencode
from html import escape

from aiogram import F, Router
from aiogram.types import CallbackQuery

from ..api.client import ApiError, OpiniaApi
from ..config import Settings
from ..services.panel import edit_panel, edit_panel_content
from ..storage.database import BotStorage
from ..ui.keyboards import back_keyboard, party_slot_occupants, role_keyboard
from .account import deliver_join_hint

router = Router(name="search")


@router.callback_query(F.data == "search:looking")
async def start_looking(callback: CallbackQuery, api: OpiniaApi, settings: Settings, storage: BotStorage) -> None:
    await callback.answer()
    try:
        await api.user(callback.from_user.id, "POST", "/dota/profiles/lfg/looking", {"looking": True})
        storage.set_choices(callback.from_user.id, "auto_search", [{"mode": "looking"}])
        await show_candidates(callback, api, settings, storage, "looking")
    except ApiError as error:
        await show_error(callback, api, settings, storage, error)


@router.callback_query(F.data == "search:recruit")
async def begin_recruiting(
    callback: CallbackQuery,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    await callback.answer()
    storage.set_choices(callback.from_user.id, "recruit_roles", [{"roles": []}])
    await edit_panel(callback.bot, storage, api, settings, callback.from_user.id, "recruit")


@router.callback_query(F.data.startswith("recruit:toggle:"))
async def toggle_recruit_role(callback: CallbackQuery, storage: BotStorage) -> None:
    await callback.answer()
    parts = (callback.data or "").split(":")
    if len(parts) == 4:
        # Accept buttons rendered by the previous bot version until the panel is refreshed.
        selected = parts[2].split(",") if parts[2] else []
        role = parts[3]
    elif len(parts) == 3:
        role = parts[2]
        selected = (storage.get_choice(callback.from_user.id, "recruit_roles", 0) or {}).get("roles", [])
    else:
        return
    selected = [item for item in selected if item in {"1", "2", "3", "4", "5"}]
    if role in selected:
        selected.remove(role)
    elif role in {"1", "2", "3", "4", "5"}:
        selected.append(role)
    storage.set_choices(callback.from_user.id, "recruit_roles", [{"roles": selected}])
    if callback.message:
        await callback.message.edit_reply_markup(reply_markup=role_keyboard(selected))


@router.callback_query(F.data == "recruit:start")
async def finish_recruiting(
    callback: CallbackQuery,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    await callback.answer()
    selected = storage.get_choice(callback.from_user.id, "recruit_roles", 0) or {"roles": []}
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
        payload = {"looking": True, "partySlug": party["slug"]}
        if selected.get("roles"):
            payload["recruitedRoles"] = selected["roles"]
        await api.user(callback.from_user.id, "POST", "/dota/profiles/lfg/looking", payload)
        storage.clear_auto_match_exclusions(callback.from_user.id)
        storage.set_choices(
            callback.from_user.id,
            "auto_search",
            [{"mode": "recruit", "partySlug": party["slug"], "roles": selected.get("roles", [])}],
        )
        await edit_panel(callback.bot, storage, api, settings, callback.from_user.id, "recruiting")
    except ApiError as error:
        await show_error(callback, api, settings, storage, error)


@router.callback_query(F.data == "search:stop")
async def stop_search(callback: CallbackQuery, api: OpiniaApi, settings: Settings, storage: BotStorage) -> None:
    await callback.answer()
    try:
        my_parties = await api.user(callback.from_user.id, "GET", "/social/parties/me")
        party = my_parties.get("party")
        payload = {"looking": False}
        if party:
            payload["partySlug"] = party["slug"]
        await api.user(callback.from_user.id, "POST", "/dota/profiles/lfg/looking", payload)
        storage.set_choices(callback.from_user.id, "auto_search", [])
        storage.clear_auto_match_exclusions(callback.from_user.id)
        await edit_panel(callback.bot, storage, api, settings, callback.from_user.id, "home")
    except ApiError as error:
        await show_error(callback, api, settings, storage, error)


@router.callback_query(F.data.startswith("recruit:slot:"))
async def select_recruit_slot(
    callback: CallbackQuery,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    role = (callback.data or "").rsplit(":", 1)[-1]
    if role not in {"1", "2", "3", "4", "5"}:
        await callback.answer("Позиция не найдена", show_alert=True)
        return
    try:
        search = storage.get_choice(callback.from_user.id, "auto_search", 0) or {}
        selected_roles = [str(item) for item in search.get("roles", [])]
        if selected_roles and role not in selected_roles:
            await callback.answer("Эту позицию не выбрали при запуске набора", show_alert=True)
            return
        profile = await api.user(callback.from_user.id, "GET", "/dota/profiles/me")
        parties = await api.user(callback.from_user.id, "GET", "/social/parties/me")
        party = parties.get("party") or ((parties.get("parties") or [None])[-1])
        if not party:
            await callback.answer("Пати больше не найдена", show_alert=True)
            return
        occupants = party_slot_occupants(party, str(profile.get("ownerUserId") or ""))
        if role in occupants:
            await callback.answer(f"Слот занимает {occupants[role]}", show_alert=True)
            return
        await callback.answer("Ищу игроков на эту позицию")
        await show_candidates(callback, api, settings, storage, "recruit", role)
    except ApiError as error:
        await show_error(callback, api, settings, storage, error)


@router.callback_query(F.data == "search:list")
async def refresh_candidates(callback: CallbackQuery, api: OpiniaApi, settings: Settings, storage: BotStorage) -> None:
    await callback.answer("Обновляю список")
    choices = storage.get_choice(callback.from_user.id, "candidates", 0) or {}
    await show_candidates(
        callback, api, settings, storage,
        choices.get("mode", "looking"), choices.get("positionRole"),
    )


@router.callback_query(F.data.startswith("candidate:"))
async def select_candidate(callback: CallbackQuery, settings: Settings, storage: BotStorage, api: OpiniaApi) -> None:
    value = (callback.data or "").split(":")
    if len(value) == 2 and value[1].isdigit():
        candidates = storage.get_choice(callback.from_user.id, "candidates", 0) or {}
        items = candidates.get("items", [])
        index = int(value[1])
        if index >= len(items):
            await callback.answer("Игрок уже недоступен", show_alert=True)
            return
        await callback.answer()
        storage.set_choices(callback.from_user.id, "selected_candidate", [items[index]])
        await edit_panel(callback.bot, storage, api, settings, callback.from_user.id, "candidate")
        return

    if len(value) != 3 or value[1] not in {"apply", "invite"}:
        await callback.answer()
        return
    selected = storage.get_choice(callback.from_user.id, "selected_candidate", 0)
    if not selected:
        await callback.answer("Игрок больше недоступен", show_alert=True)
        return
    try:
        position_role = value[2]
        body: dict = {"targetSlug": selected["slug"]}
        if position_role != "0":
            body["positionRole"] = position_role
        if value[1] == "invite":
            my_parties = await api.user(callback.from_user.id, "GET", "/social/parties/me")
            party = my_parties.get("party") or ((my_parties.get("parties") or [None])[-1])
            if party:
                body["partySlug"] = party["slug"]
        result = await api.user(callback.from_user.id, "POST", "/social/parties/stack", body)
        invite = result.get("invite") or {}
        if invite.get("status") == "ACCEPTED" and result.get("party", {}).get("slug"):
            await deliver_join_hint(
                callback.bot,
                storage,
                callback.from_user.id,
                settings.site_url,
                result["party"]["slug"],
            )
            await callback.answer("Вы вступили в пати")
        elif value[1] == "apply" and selected.get("partySlug"):
            await callback.answer("Заявка отправлена. Ответ придёт в уведомлении.")
        else:
            await callback.answer("Готово — действие отправлено.")
        candidates_state = storage.get_choice(callback.from_user.id, "candidates", 0) or {}
        return_screen = "recruiting" if candidates_state.get("mode") == "recruit" else "home"
        await edit_panel(callback.bot, storage, api, settings, callback.from_user.id, return_screen)
    except ApiError as error:
        await callback.answer(str(error)[:180], show_alert=True)


async def show_candidates(
    callback,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
    mode: str,
    position_role: str | None = None,
) -> None:
    try:
        profile = await api.user(callback.from_user.id, "GET", "/dota/profiles/me")
        roles = profile.get("roles", [])
        if mode == "recruit":
            recruit = storage.get_choice(callback.from_user.id, "recruit_roles", 0) or {}
            roles = [position_role] if position_role else (recruit.get("roles") or roles)
        params = {}
        if roles:
            params["roles"] = ",".join(str(role) for role in roles)
        if profile.get("server"):
            params["server"] = profile["server"]
        query = urlencode(params)
        path = "/dota/profiles/lfg" + (f"?{query}" if query else "")
        result = await api.user(callback.from_user.id, "GET", path)
        candidates = [
            item for item in result.get("results", [])
            if item.get("slug") and item.get("ownerUserId") != profile.get("ownerUserId")
        ]
        if mode == "recruit":
            candidates = [
                item for item in candidates
                if not item.get("partySlug")
                and (not position_role or position_role in [str(role) for role in item.get("roles", [])])
            ]
            for item in candidates:
                item["_recruitRole"] = position_role
        storage.set_choices(
            callback.from_user.id,
            "candidates",
            [{"items": candidates, "mode": mode, "positionRole": position_role}],
        )
        await edit_panel(callback.bot, storage, api, settings, callback.from_user.id, "candidates")
    except ApiError as error:
        await show_error(callback, api, settings, storage, error)


async def show_error(callback, api: OpiniaApi, settings: Settings, storage: BotStorage, error: ApiError) -> None:
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
