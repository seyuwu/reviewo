from urllib.parse import urlencode

from aiogram import F, Router
from aiogram.types import CallbackQuery

from ..api.client import ApiError, OpiniaApi
from ..config import Settings
from ..services.panel import edit_panel
from ..storage.database import BotStorage
from ..ui.keyboards import role_keyboard
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
        await callback.message.answer(str(error))


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
    if len(parts) < 4:
        return
    selected = parts[2].split(",") if parts[2] else []
    role = parts[3]
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
        await show_candidates(callback, api, settings, storage, "recruit")
    except ApiError as error:
        await callback.message.answer(str(error))


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
        await callback.message.answer(str(error))


@router.callback_query(F.data == "search:list")
async def refresh_candidates(callback: CallbackQuery, api: OpiniaApi, settings: Settings, storage: BotStorage) -> None:
    await callback.answer("Обновляю список")
    choices = storage.get_choice(callback.from_user.id, "candidates", 0) or {}
    await show_candidates(callback, api, settings, storage, choices.get("mode", "looking"))


@router.callback_query(F.data.startswith("candidate:"))
async def select_candidate(callback: CallbackQuery, settings: Settings, storage: BotStorage, api: OpiniaApi) -> None:
    await callback.answer()
    value = (callback.data or "").split(":")
    if len(value) == 2 and value[1].isdigit():
        candidates = storage.get_choice(callback.from_user.id, "candidates", 0) or {}
        items = candidates.get("items", [])
        index = int(value[1])
        if index >= len(items):
            await callback.answer("Игрок уже недоступен", show_alert=True)
            return
        storage.set_choices(callback.from_user.id, "selected_candidate", [items[index]])
        await edit_panel(callback.bot, storage, api, settings, callback.from_user.id, "candidate")
        return

    if len(value) != 3 or value[1] not in {"apply", "invite"}:
        return
    selected = storage.get_choice(callback.from_user.id, "selected_candidate", 0)
    if not selected:
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
        elif value[1] == "apply" and selected.get("partySlug"):
            await callback.message.answer("Заявка отправлена. Ответ придёт в уведомлении.")
        else:
            await callback.message.answer("Готово — действие отправлено.")
        await edit_panel(callback.bot, storage, api, settings, callback.from_user.id, "home")
    except ApiError as error:
        await callback.message.answer(str(error))


async def show_candidates(callback, api: OpiniaApi, settings: Settings, storage: BotStorage, mode: str) -> None:
    try:
        profile = await api.user(callback.from_user.id, "GET", "/dota/profiles/me")
        roles = profile.get("roles", [])
        if mode == "recruit":
            recruit = storage.get_choice(callback.from_user.id, "recruit_roles", 0) or {}
            roles = recruit.get("roles") or roles
        params = {}
        if roles:
            params["roles"] = ",".join(roles)
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
            candidates = [item for item in candidates if not item.get("partySlug")]
        storage.set_choices(callback.from_user.id, "candidates", [{"items": candidates, "mode": mode}])
        await edit_panel(callback.bot, storage, api, settings, callback.from_user.id, "candidates")
    except ApiError as error:
        await callback.message.answer(str(error))
