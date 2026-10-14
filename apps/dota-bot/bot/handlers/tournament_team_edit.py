"""Edit the current captain's tournament entry without touching a base team."""
from html import escape
from urllib.parse import quote

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message

from ..api.client import ApiError
from ..services.callbacks import acknowledge_callback
from ..services.panel_activity import panel_repost_lock
from ..services.tournament_participation import load_tournament_context, tournament_api_path, uuid_hex
from .tournaments import _button, _panel, _participation, _private_callback

router = Router(name="tournament-team-edit")


class TournamentTeamEdit(StatesGroup):
    value = State()


def _preview(value, budget=350):
    parts, used = [], 0
    for char in str(value or ""):
        part = escape(char)
        if used + len(part) > budget - 1:
            return "".join(parts) + "…"
        parts.append(part)
        used += len(part)
    return "".join(parts)


def _entry_path(context, entry_id):
    return tournament_api_path(context) + "/entries/" + quote(entry_id, safe="")


def _editable(room, field):
    if not room.get("isCaptain") or room.get("phase") == "CLOSED":
        return False
    if field == "description":
        return bool(room.get("canEditDescription"))
    return bool(room.get("canManageRoster")) and room.get("phase") == "TOURNAMENT"


async def _current(api, storage, user_id, context, expected_id=None):
    result = await _participation(api, storage, user_id, context)
    entry = result.get("entry") or {}
    if (result.get("state") != "JOINED" or not entry.get("isCaptain") or not uuid_hex(entry.get("id"))
            or (expected_id and entry["id"] != expected_id)):
        raise ApiError("Редактировать команду может только её текущий капитан.", 403)
    room = await api.user(user_id, "GET", _entry_path(context, entry["id"]) + "/room")
    if room.get("entryId") != entry["id"] or not room.get("isCaptain"):
        raise ApiError("Команда или капитан изменились. Открой команду заново.", 409)
    return entry, room


async def _show_editor(bot, api, settings, storage, user_id, chat_id, context, entry, room, notice=""):
    text = "<b>Название и описание команды</b>\n\n"
    if notice:
        text += notice + "\n\n"
    text += "Название: <b>" + _preview(room.get("name") or entry.get("name"), 300) + "</b>\n\n"
    description = room.get("description") or ""
    text += "Описание:\n" + (_preview(description, 380) if description else "Пока не добавлено.")
    rows = []
    if _editable(room, "name"):
        rows.append([_button("✏️ Изменить название", "team-name", context["eventHex"])])
    else:
        text += "\n\nНазвание меняется, пока открыт набор команды."
    if _editable(room, "description"):
        rows.append([_button("📝 Изменить описание", "team-description", context["eventHex"])])
        if description:
            rows.append([_button("🧹 Очистить описание", "team-clear", context["eventHex"])])
    rows.append([_button("← К команде", "status", context["eventHex"])])
    await _panel(bot, storage, api, settings, user_id, chat_id, "team-edit", text, rows)


async def _save(bot, api, settings, storage, state, user_id, chat_id, context, draft, guard):
    field, value = draft["field"], draft["value"]
    entry, room = await _current(api, storage, user_id, context, draft["entryId"])
    if guard[0].revision != guard[1]:
        return
    if not _editable(room, field):
        raise ApiError("Это поле сейчас нельзя изменить. Обнови экран команды.", 403)
    await api.user(user_id, "PATCH", _entry_path(context, entry["id"]) + "/" + field, {field: value})
    if guard[0].revision != guard[1]:
        return
    await state.clear()
    notice = "✅ Название сохранено." if field == "name" else "✅ Описание сохранено."
    try:
        updated = await api.user(user_id, "GET", _entry_path(context, entry["id"]) + "/room")
        if guard[0].revision != guard[1]:
            return
        await _show_editor(bot, api, settings, storage, user_id, chat_id, context, entry, updated, notice)
    except ApiError:
        if guard[0].revision != guard[1]:
            return
        await _panel(bot, storage, api, settings, user_id, chat_id, "team-edit", notice,
                     [[_button("Обновить команду", "team-edit", context["eventHex"])]])


async def _error(bot, api, settings, storage, state, user_id, chat_id, context, error):
    data = await state.get_data()
    draft = data.get("team_edit") or {}
    retry = (not error.status or error.status >= 500) and "value" in draft
    if retry:
        text = "<b>Не удалось сохранить</b>\n\nИзменение сохранено в черновике. Попробуй ещё раз."
        rows = [[_button("Повторить сохранение", "team-retry", context["eventHex"])]]
    else:
        await state.clear()
        text = "<b>Редактирование недоступно</b>\n\n" + _preview(str(error), 500)
        rows = []
    rows.append([_button("← Отмена" if retry else "← К команде", "team-edit" if retry else "status", context["eventHex"])])
    await _panel(bot, storage, api, settings, user_id, chat_id, "team-edit", text, rows)


@router.callback_query(F.data.regexp(r"^tr:team-(?:edit|name|description|clear|retry):[a-f0-9]{32}$"))
async def edit_tournament_team(callback: CallbackQuery, state: FSMContext, api, settings, storage):
    if not await _private_callback(callback):
        return
    user_id, chat_id = callback.from_user.id, callback.message.chat.id
    action, event_hex = (callback.data or "").split(":")[1:]
    try:
        context = load_tournament_context(storage, user_id, event_hex)
    except ApiError as error:
        await callback.answer(str(error), show_alert=True)
        return
    acknowledge_callback(callback)
    publication_lock = panel_repost_lock(user_id)
    guard = (publication_lock, publication_lock.begin_update())
    try:
        if action == "team-retry":
            draft = (await state.get_data()).get("team_edit") or {}
            if draft.get("eventHex") != event_hex or "value" not in draft:
                raise ApiError("Черновик устарел. Открой редактирование заново.", 409)
            await _save(callback.bot, api, settings, storage, state, user_id, chat_id, context, draft, guard)
            return
        await state.clear()
        entry, room = await _current(api, storage, user_id, context)
        if publication_lock.revision != guard[1]:
            return
        if action == "team-edit":
            await _show_editor(callback.bot, api, settings, storage, user_id, chat_id, context, entry, room)
            return
        field = "name" if action == "team-name" else "description"
        if not _editable(room, field):
            raise ApiError("Это поле сейчас нельзя изменить. Обнови экран команды.", 403)
        draft = {"eventHex": event_hex, "entryId": entry["id"], "field": field}
        if action == "team-clear":
            draft = {**draft, "value": ""}
            await state.set_state(TournamentTeamEdit.value)
            await state.update_data(team_edit=draft)
            await _save(callback.bot, api, settings, storage, state, user_id, chat_id, context, draft, guard)
            return
        await state.set_state(TournamentTeamEdit.value)
        await state.update_data(team_edit=draft)
        label = "название" if field == "name" else "описание"
        current = room.get(field) or entry.get(field) or "Пока не задано."
        text = f"<b>Изменить {label} команды</b>\n\nСейчас:\n{_preview(current, 380)}\n\n"
        text += "Пришли новое название одним сообщением: от 2 до 80 символов." if field == "name" else "Пришли новое описание одним сообщением: до 1000 символов. Переносы строк сохранятся."
        await _panel(callback.bot, storage, api, settings, user_id, chat_id, "team-edit", text,
                     [[_button("← Отмена", "team-edit", event_hex)]])
    except ApiError as error:
        if publication_lock.revision != guard[1]:
            return
        await _error(callback.bot, api, settings, storage, state, user_id, chat_id, context, error)


@router.message(TournamentTeamEdit.value, F.chat.type == "private", F.text & ~F.text.startswith("/"))
async def receive_tournament_team_text(message: Message, state: FSMContext, api, settings, storage):
    if not message.from_user or message.chat.id != message.from_user.id:
        return
    user_id = message.from_user.id
    draft = (await state.get_data()).get("team_edit")
    if not isinstance(draft, dict):
        return
    try:
        context = load_tournament_context(storage, user_id, draft["eventHex"])
    except (ApiError, KeyError):
        await state.clear()
        return
    value = (message.text or "").strip()
    units = len(value.encode("utf-16-le")) // 2
    valid = len(value) >= 2 and units <= 80 if draft["field"] == "name" else bool(value) and units <= 1000
    if not valid:
        text = "Название должно содержать от 2 до 80 символов." if draft["field"] == "name" else "Описание должно содержать до 1000 символов. Очистить его можно кнопкой в настройках команды."
        await _panel(message.bot, storage, api, settings, user_id, message.chat.id, "team-edit", text,
                     [[_button("← Отмена", "team-edit", context["eventHex"])]])
        return
    draft = {**draft, "value": value}
    await state.update_data(team_edit=draft)
    publication_lock = panel_repost_lock(user_id)
    guard = (publication_lock, publication_lock.begin_update())
    try:
        await _save(message.bot, api, settings, storage, state, user_id, message.chat.id, context, draft, guard)
    except ApiError as error:
        if publication_lock.revision != guard[1]:
            return
        await _error(message.bot, api, settings, storage, state, user_id, message.chat.id, context, error)
