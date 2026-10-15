"""Captain roster controls using the existing tournament member endpoints."""
import asyncio
import time
from uuid import uuid4

from aiogram import F, Router
from aiogram.types import InlineKeyboardButton

from ..api.client import ApiError
from ..services.callbacks import acknowledge_callback
from ..services.panel_activity import panel_repost_lock
from ..services.tournament_participation import ROLE_NAMES, load_tournament_context, tournament_api_path, uuid_hex
from .tournament_team_edit import _preview
from .tournaments import _button, _panel, _participation, _private_callback

router = Router(name="tournament-roster")
_CHOICES = "tournament_roster_actions"


def _choice(storage, user_id, token, kind):
    for index in range(5):
        item = storage.get_choice(user_id, _CHOICES, index)
        if item and item.get("token") == token and item.get("kind") == kind and item.get("expiresAt", 0) > time.time():
            return item
    raise ApiError("Кнопка устарела. Открой состав заново.", 409)


def _editable(room):
    return room.get("isCaptain") and room.get("canManageRoster") and room.get("phase") == "TOURNAMENT"


async def _current(api, storage, user_id, context, choice=None):
    result = await _participation(api, storage, user_id, context)
    entry = result.get("entry") or {}
    if result.get("state") != "JOINED" or not entry.get("isCaptain") or not uuid_hex(entry.get("id")):
        raise ApiError("Управлять составом может только текущий капитан команды.", 403)
    if choice and (entry["id"] != choice["entryId"] or entry.get("membershipId") != choice["captainMembershipId"]):
        raise ApiError("Команда или участие капитана изменились. Открой состав заново.", 409)
    room, user = await asyncio.gather(
        api.user(user_id, "GET", tournament_api_path(context) + "/entries/" + entry["id"] + "/room"),
        api.user(user_id, "GET", "/auth/me"),
    )
    if room.get("entryId") != entry["id"] or not room.get("isCaptain") or not uuid_hex(user.get("id")):
        raise ApiError("Команда или капитан изменились. Открой состав заново.", 403)
    return result, room, user["id"]


def _signature(room):
    return sorted((str(member.get("userId") or ""), str(member.get("positionRole") or ""), str(member.get("displayName") or ""))
                  for member in room.get("members", []))


async def _show(bot, api, settings, storage, user_id, chat_id, context, result, room, captain_id, notice=""):
    entry, members = result["entry"], room.get("members", [])[:5]
    lines = [f"👥 <b>Состав команды · {len(members)}/5</b>", _preview(room.get("name"), 100)]
    if notice:
        lines += ["", notice]
    rows, choices = [], []
    editable = _editable(room)
    lines.append("")
    for member in members:
        role = ROLE_NAMES.get(str(member.get("positionRole")), "Без позиции")
        captain = member.get("userId") == captain_id
        lines.append(("👑 " if captain else "• ") + _preview(member.get("displayName") or "Игрок", 65) + " · " + role)
        if editable and uuid_hex(member.get("userId")) and not captain:
            item = {"token": uuid4().hex, "kind": "pick", "eventHex": context["eventHex"], "entryId": entry["id"],
                    "captainMembershipId": entry.get("membershipId"), "userId": member["userId"],
                    "positionRole": member.get("positionRole"), "name": str(member.get("displayName") or "Игрок"),
                    "expiresAt": time.time() + 120}
            choices.append(item)
            rows.append([_button("Убрать " + str(member.get("positionRole") or "игрока") + " · " + str(member.get("displayName") or "Игрок")[:18],
                                 "roster-pick", item["token"])])
    storage.set_choices(user_id, _CHOICES, choices)
    if not editable:
        lines += ["", "Изменение состава закрыто правилами турнира."]
    elif choices:
        lines += ["", "Выбери игрока для удаления. Затем потребуется подтверждение."]
    else:
        lines += ["", "Других игроков в составе пока нет."]
    rows += [[_button("🔄 Обновить", "roster", context["eventHex"]),
              _button("← Настройки", "team-settings", context["eventHex"])],
             [_button("← К команде", "status", context["eventHex"])]]
    await _panel(bot, storage, api, settings, user_id, chat_id, "roster", "\n".join(lines), rows)


@router.callback_query(F.data.regexp(r"^tr:roster(?:-pick|-remove)?:[a-f0-9]{32}$"))
async def tournament_roster_action(callback, api, settings, storage):
    if not await _private_callback(callback):
        return
    user_id, chat_id = callback.from_user.id, callback.message.chat.id
    _, action, token = callback.data.split(":")
    context = None
    acknowledge_callback(callback)
    lock = panel_repost_lock(user_id)
    revision = lock.begin_update()
    try:
        choice = None if action == "roster" else _choice(storage, user_id, token, "pick" if action == "roster-pick" else "remove")
        context = load_tournament_context(storage, user_id, choice["eventHex"] if choice else token)
        result, room, captain_id = await _current(api, storage, user_id, context, choice)
        if lock.revision != revision:
            return
        if action == "roster":
            await _show(callback.bot, api, settings, storage, user_id, chat_id, context, result, room, captain_id)
            return
        if not _editable(room):
            raise ApiError("Изменение состава закрыто правилами турнира.", 409)
        target = next((member for member in room.get("members", []) if member.get("userId") == choice["userId"]), None)
        if not target or target.get("userId") == captain_id or target.get("positionRole") != choice["positionRole"]:
            raise ApiError("Игрок уже вышел или состав изменился. Открой состав заново.", 409)
        if action == "roster-pick":
            confirmation = {**choice, "token": uuid4().hex, "kind": "remove", "roster": _signature(room), "expiresAt": time.time() + 120}
            storage.set_choices(user_id, _CHOICES, [confirmation])
            text = "<b>Убрать игрока из команды?</b>\n\n" + _preview(target.get("displayName"), 200)
            text += " · " + ROLE_NAMES.get(str(target.get("positionRole")), "Без позиции")
            text += "\n\nЕго место освободится. Если состав был полным, можно будет добрать замену."
            await _panel(callback.bot, storage, api, settings, user_id, chat_id, "roster-confirm", text,
                [[_button("Да, убрать игрока", "roster-remove", confirmation["token"])],
                 [_button("← Не удалять", "roster", context["eventHex"])]])
            return
        # SQLite serializes tuples as lists. Compare the stored snapshot after a fresh read.
        if [list(member) for member in _signature(room)] != choice["roster"]:
            raise ApiError("Состав изменился после подтверждения. Выбери игрока заново.", 409)
        _choice(storage, user_id, token, "remove")
        storage.set_choices(user_id, _CHOICES, [])
        await api.user(user_id, "DELETE", tournament_api_path(context) + "/entries/" + choice["entryId"] + "/members/" + choice["userId"])
        if lock.revision != revision:
            return
        try:
            result, room, captain_id = await _current(api, storage, user_id, context)
        except ApiError:
            if lock.revision == revision:
                await _panel(callback.bot, storage, api, settings, user_id, chat_id, "roster", "✅ Игрок удалён. Обнови состав, чтобы увидеть изменения.",
                    [[_button("Обновить состав", "roster", context["eventHex"])]])
            return
        if lock.revision == revision:
            await _show(callback.bot, api, settings, storage, user_id, chat_id, context, result, room, captain_id,
                        "✅ Игрок удалён. Его место свободно.")
    except ApiError as error:
        if lock.revision != revision:
            return
        rows = [[_button("Обновить состав", "roster", context["eventHex"])]] if context else []
        text = "Не удалось подтвердить операцию. Обнови состав перед повторной попыткой." if not error.status or error.status >= 500 else str(error)
        await _panel(callback.bot, storage, api, settings, user_id, chat_id, "roster-error", _preview(text, 500),
                     rows + [[_button("← К команде", "status", context["eventHex"])]] if context else
                     [[InlineKeyboardButton(text="← Турниры", callback_data="tournaments:list")]])
