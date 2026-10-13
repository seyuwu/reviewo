"""Captain inbox and request profiles, independent of recruitment alerts."""

from html import escape
import time
from urllib.parse import quote
from uuid import UUID, uuid4

from aiogram import F, Router
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from ..api.client import ApiError
from ..services.callbacks import acknowledge_callback
from ..services.panel import edit_panel, edit_panel_content
from ..services.tournament_applications import NOTICE_PREFIX, consume_application_notice, consume_request_notices, notifications_key
from ..services.tournament_participation import ROLE_NAMES, load_tournament_context, save_tournament_context, tournament_api_path, tournament_callback
from ..services.tournament_recruitment import refresh_linked_tournament_session
from .tournaments import _private_callback

router = Router(name="tournament-applications")
CHOICES_KEY = "tournament_application_actions"


def choices(storage, user_id, items):
    result = [{**item, "token": uuid4().hex} for item in items]
    storage.set_choices(user_id, CHOICES_KEY, result)
    return result


def choice(storage, user_id, token, kind):
    for index in range(10):
        item = storage.get_choice(user_id, CHOICES_KEY, index)
        if item is None:
            break
        if item and item.get("token") == token and item.get("kind") == kind:
            return item
    raise ApiError("Кнопка устарела. Открой заявки в команду заново.", 409)


async def show_requests(callback, api, settings, storage, context, action):
    user_id = callback.from_user.id
    pages = context.get("requestCursors") or [None]
    page = min(max(0, int(context.get("requestPage") or 0)), len(pages) - 1)
    if action == "requests":
        pages, page = [None], 0
    elif action == "request-next" and context.get("requestNextCursor"):
        pages = pages[:page + 1] + [context["requestNextCursor"]]
        page += 1
    elif action == "request-prev":
        page = max(0, page - 1)
    path = tournament_api_path(context) + "/participation/applications"
    if pages[page]:
        path += "?cursor=" + quote(pages[page], safe="")
    board = await api.user(user_id, "GET", path)
    save_tournament_context(storage, user_id, {"id": context["eventId"], **context},
        requestCursors=pages, requestPage=page, requestNextCursor=board.get("nextCursor"))
    items = choices(storage, user_id, [{"kind": "player", "eventHex": context["eventHex"], "requestId": player["requestId"]}
        for player in board.get("players", [])])
    lines = ["📨 <b>Заявки в команду</b>", "", "<b>" + escape(str(board["entryName"])[:80]) + "</b>", ""]
    rows = []
    for player, item in zip(board.get("players", []), items):
        name = str(player["playerName"])[:40]
        if player.get("company"):
            lines.append("👥 " + escape(name) + " · вступают вместе")
        else:
            lines.append("• " + escape(name) + " · " + ROLE_NAMES.get(str(player.get("role")), "без позиции")
            + " · " + escape(str(player.get("mmr") if player.get("mmr") is not None else "—")) + " MMR")
        rows.append([InlineKeyboardButton(text=("👥 " if player.get("company") else "👤 ") + name, callback_data="ta:player:" + item["token"])])
    if not items:
        lines.append("Активных заявок пока нет.")
    else:
        lines += ["", "Нажми на игрока, чтобы посмотреть профиль и принять решение."]
    navigation = []
    if page:
        navigation.append(InlineKeyboardButton(text="← Заявки", callback_data=tournament_callback("request-prev", context["eventHex"])))
    if board.get("nextCursor"):
        navigation.append(InlineKeyboardButton(text="Заявки →", callback_data=tournament_callback("request-next", context["eventHex"])))
    if navigation:
        rows.append(navigation)
    rows += [[InlineKeyboardButton(text="Обновить заявки", callback_data=tournament_callback("requests", context["eventHex"]))],
             [InlineKeyboardButton(text="← Команда", callback_data=tournament_callback("status", context["eventHex"]))]]
    if board.get("notificationsEnabled") is False:
        lines += ["", "🔕 Уведомления о заявках отключены. Все заявки остаются здесь."]
        rows.insert(-1, [InlineKeyboardButton(text="🔔 Включить уведомления", callback_data=tournament_callback("request-unmute", context["eventHex"]))])
    else:
        rows.insert(-1, [InlineKeyboardButton(text="🔕 Отключить уведомления", callback_data=tournament_callback("request-mute", context["eventHex"]))])
    await edit_panel_content(callback.bot, storage, api, settings, user_id, "tournaments:requests", "\n".join(lines),
        InlineKeyboardMarkup(inline_keyboard=rows), callback.message.chat.id)


async def show_profile(callback, api, settings, storage, context, application, force_new=False):
    role = ROLE_NAMES.get(str(application.get("role")), "не указана")
    lines = ["👤 <b>" + escape(str(application["playerName"])[:80]) + "</b>", "",
             "MMR: <b>" + escape(str(application.get("mmr") if application.get("mmr") is not None else "—")) + "</b>",
             "Заявка на позицию: <b>" + role + "</b>", "Команда: " + escape(str(application["entryName"])[:80])]
    company = application.get("company")
    if company:
        lines = [f"👥 <b>Компания · {company['count']} игрока</b>", "", "Вступают вместе в «" + escape(str(application["entryName"])[:80]) + "»."]
        for member in company.get("members", [])[:4]:
            lines.append("• " + escape(str(member.get("name") or "Игрок")[:35]) + " · "
                + ROLE_NAMES.get(str(member.get("role")), "без позиции") + " · "
                + escape(str(member.get("mmr") if member.get("mmr") is not None else "—")) + " MMR")
    username = application.get("telegramUsername")
    if username:
        lines += ["", f'<a href="https://t.me/{quote(str(username), safe="")}">@{escape(str(username))}</a>']
    actions = choices(storage, callback.from_user.id, [{"kind": "decision", "eventHex": context["eventHex"],
        "requestId": application["requestId"], "requestUpdatedAt": application["requestUpdatedAt"], "role": application["role"]}])
    rows, decisions = [], []
    if application.get("canAccept"):
        decisions.append(InlineKeyboardButton(text="✅ Принять всех" if company else "✅ Принять", callback_data="ta:accept:" + actions[0]["token"]))
    if application.get("canDecline"):
        decisions.append(InlineKeyboardButton(text="❌ Отклонить", callback_data="ta:decline:" + actions[0]["token"]))
    if not application.get("active"):
        lines += ["", "Эта заявка уже не активна: игрок мог выбрать другую команду или отозвать её."]
    elif not application.get("canAccept"):
        lines += ["", "Сейчас принять заявку нельзя: позиция занята или игрок недоступен."]
    if decisions:
        rows.append(decisions)
    if application.get("profileSlug"):
        url = settings.site_url.rstrip("/") + "/dota/" + quote(str(application["profileSlug"]), safe="")
        rows.append([InlineKeyboardButton(text="Полный профиль", url=url)])
    rows += [[InlineKeyboardButton(text="← Заявки в команду", callback_data=tournament_callback("requests", context["eventHex"]))]]
    await edit_panel(callback.bot, storage, api, settings, callback.from_user.id, "tournaments:application-profile", callback.message.chat.id,
        content=("\n".join(lines), InlineKeyboardMarkup(inline_keyboard=rows)), force_new_message=force_new)


@router.callback_query(F.data.regexp(r"^tr:(?:requests|request-next|request-prev|request-mute|request-unmute):[a-f0-9]{32}$|^(?:tap|ta):(?:profile|player|accept|decline|mute):[a-f0-9]{32}$"))
async def application_action(callback, state, api, settings, storage):
    if not await _private_callback(callback):
        return
    prefix, action, token = callback.data.split(":")
    source = None
    try:
        if prefix == "tap":
            source = storage.get_choice(callback.from_user.id, NOTICE_PREFIX + token, 0)
            if not source:
                raise ApiError("Уведомление уже открыто. Посмотри заявки в меню команды.", 409)
            event_hex = source["eventHex"]
        elif prefix == "ta":
            selected = choice(storage, callback.from_user.id, token, "player" if action == "player" else "decision")
            event_hex = selected["eventHex"]
        else:
            event_hex = token
        context = load_tournament_context(storage, callback.from_user.id, event_hex)
        acknowledge_callback(callback)
        await refresh_linked_tournament_session(api, storage, callback.from_user.id)
        await state.clear()
        base = tournament_api_path(context) + "/participation"
        if action in {"mute", "request-mute", "request-unmute"}:
            enabled = action == "request-unmute"
            result = await api.user(callback.from_user.id, "POST", base + "/application-notifications", {"enabled": enabled})
            storage.set_choices(callback.from_user.id, notifications_key(event_hex, result["captainUserId"]), [{"enabled": enabled, "changedAt": time.time()}])
            if source:
                storage.set_choices(callback.from_user.id, NOTICE_PREFIX + token, [{**source, "muted": True, "messageId": callback.message.message_id}])
                await callback.bot.edit_message_text("🔕 Уведомления о заявках отключены.\n\nВсе заявки можно посмотреть в команде → «Заявки в команду».",
                    chat_id=callback.from_user.id, message_id=callback.message.message_id, reply_markup=None)
                storage.add_temporary_message(callback.from_user.id, callback.from_user.id, callback.message.message_id, 15)
            else:
                await show_requests(callback, api, settings, storage, context, "requests")
        elif prefix == "tr":
            await show_requests(callback, api, settings, storage, context, action)
        elif action in {"profile", "player"}:
            path = (base + f"/applications/{UUID(token)}") if prefix == "tap" else (base + f"/application-requests/{selected['requestId']}")
            application = await api.user(callback.from_user.id, "GET", path)
            await show_profile(callback, api, settings, storage, context, application, force_new=prefix == "tap")
            if source:
                await consume_application_notice(callback.bot, storage, callback.from_user.id, token, callback.message.message_id)
            await consume_request_notices(callback.bot, storage, callback.from_user.id, application["requestId"])
        else:
            decision = "ACCEPT" if action == "accept" else "DECLINE"
            path = base + (f"/applications/{UUID(token)}/decision" if prefix == "tap" else f"/application-requests/{selected['requestId']}/decision")
            body = {"decision": decision}
            if prefix == "ta":
                body.update(requestUpdatedAt=selected["requestUpdatedAt"], positionRole=selected["role"])
            result = await api.user(callback.from_user.id, "POST", path, body)
            text = ("✅ <b>Заявка принята</b>" if decision == "ACCEPT" else "❌ <b>Заявка отклонена</b>")
            text += "\n\n" + escape(str(result["playerName"])[:80]) + " · " + escape(str(result["entryName"])[:80])
            rows = [[InlineKeyboardButton(text="📨 Заявки в команду", callback_data=tournament_callback("requests", event_hex))],
                    [InlineKeyboardButton(text="← Команда", callback_data=tournament_callback("status", event_hex))]]
            await edit_panel(callback.bot, storage, api, settings, callback.from_user.id, "tournaments:application-result", callback.message.chat.id,
                content=(text, InlineKeyboardMarkup(inline_keyboard=rows)), force_new_message=prefix == "tap")
            if source:
                await consume_application_notice(callback.bot, storage, callback.from_user.id, token, callback.message.message_id)
            elif prefix == "ta":
                await consume_request_notices(callback.bot, storage, callback.from_user.id, selected["requestId"])
    except ApiError as error:
        if source and error.status in {403, 404, 409}:
            await consume_application_notice(callback.bot, storage, callback.from_user.id, token, callback.message.message_id)
        await callback.answer(str(error), show_alert=True)
