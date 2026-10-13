"""Durable captain notifications; all decisions are revalidated by the API."""

from html import escape
import time
from urllib.parse import quote
from uuid import UUID

from aiogram.exceptions import TelegramAPIError, TelegramForbiddenError, TelegramNetworkError
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from ..api.client import ApiError
from .tournament_participation import ROLE_NAMES, save_tournament_context, tournament_callback, uuid_hex
from .tournament_recruitment import refresh_linked_tournament_session
from .telegram_session import is_connection_setup_failure

NOTICE_PREFIX = "tournament_application_notice:"
PREF_PREFIX = "tournament_application_notifications:"


def notifications_key(event_hex, captain_id):
    return PREF_PREFIX + event_hex + ":" + str(captain_id)


def application_notice_text(application):
    company = application.get("company")
    if company:
        lines = ["👥 <b>Заявка компании друзей</b>", "", "Команда: <b>" + escape(str(application["entryName"])[:80]) + "</b>"]
        for member in company.get("members", [])[:4]:
            lines.append("• " + escape(str(member.get("name") or "Игрок")[:35]) + " · "
                + ROLE_NAMES.get(str(member.get("role")), "без позиции") + " · " + escape(str(member.get("mmr") if member.get("mmr") is not None else "—")) + " MMR")
        lines += ["", f"Вступают вместе: {company['count']} игрока. Принятие добавит всех в состав."]
        if not application.get("canAccept"):
            lines.append("Состав или позиции изменились — принять заявку сейчас нельзя.")
        return "\n".join(lines)
    lines = ["📨 <b>Новая заявка в команду</b>", "", "🏆 " + escape(str(application["tournamentTitle"])[:100]),
             "Команда: <b>" + escape(str(application["entryName"])[:80]) + "</b>", "",
             "👤 <b>" + escape(str(application["playerName"])[:60]) + "</b>",
             "Позиция: " + ROLE_NAMES.get(str(application.get("role")), "не указана"),
             "MMR: " + escape(str(application.get("mmr") if application.get("mmr") is not None else "—"))]
    username = application.get("telegramUsername")
    if username:
        lines.append(f'<a href="https://t.me/{quote(str(username), safe="")}">@{escape(str(username))}</a>')
    lines += ["", "Посмотри профиль и реши, подходит ли игрок твоему составу."]
    if not application.get("canAccept"):
        lines.append("Сейчас принять заявку нельзя: позиция занята или игрок недоступен.")
    return "\n".join(lines)


async def deliver_tournament_application_notice(bot, api, settings, storage, row):
    payload = row.get("payload") or {}
    event_hex, notice_hex = uuid_hex(payload.get("tournamentId")), uuid_hex(row.get("id"))
    slug = payload.get("tournamentSlug")
    try:
        user_id = int(row.get("telegramUserId"))
    except (TypeError, ValueError):
        return True
    if user_id <= 0 or not event_hex or not notice_hex or not isinstance(slug, str) or not slug:
        return True
    if storage.has_delivered_notification(str(row["id"])):
        return True
    try:
        await refresh_linked_tournament_session(api, storage, user_id)
        snapshot_started = time.time()
        application = await api.user(user_id, "GET", "/dota/tournaments/" + quote(slug, safe="")
                                     + f"/participation/applications/{UUID(notice_hex)}")
        if not application.get("active") or application.get("notificationsEnabled") is False:
            return True
    except ApiError as error:
        return error.status in {401, 403, 404, 409}
    context = save_tournament_context(storage, user_id, {"id": str(UUID(event_hex)), "slug": slug, "title": application["tournamentTitle"]})
    pref_key = notifications_key(event_hex, application.get("captainUserId"))
    preference = storage.get_choice(user_id, pref_key, 0) or {}
    if preference.get("enabled") is False and preference.get("changedAt", 0) >= snapshot_started:
        return True
    saved = {"eventHex": event_hex, "slug": slug, "noticeId": str(UUID(notice_hex)), "requestId": application["requestId"], "chatId": user_id,
             "captainUserId": application.get("captainUserId")}
    storage.set_choices(user_id, NOTICE_PREFIX + notice_hex, [saved])
    buttons = []
    if application.get("canAccept"):
        buttons.append(InlineKeyboardButton(text="✅ Принять всех" if application.get("company") else "✅ Принять", callback_data="tap:accept:" + notice_hex))
    if application.get("canDecline"):
        buttons.append(InlineKeyboardButton(text="❌ Отклонить", callback_data="tap:decline:" + notice_hex))
    rows = [[InlineKeyboardButton(text="👥 Посмотреть компанию" if application.get("company") else "👤 Посмотреть профиль", callback_data="tap:profile:" + notice_hex)]]
    if buttons:
        rows.append(buttons)
    rows.append([InlineKeyboardButton(text="📨 Все заявки", callback_data=tournament_callback("requests", context["eventHex"]))])
    rows.append([InlineKeyboardButton(text="🔕 Отключить уведомления", callback_data="tap:mute:" + notice_hex)])
    try:
        message = await bot.send_message(user_id, application_notice_text(application), parse_mode="HTML",
            reply_markup=InlineKeyboardMarkup(inline_keyboard=rows), disable_web_page_preview=True)
    except TelegramForbiddenError:
        storage.mark_bot_user_blocked(user_id)
        return True
    except TelegramNetworkError as error:
        return not is_connection_setup_failure(error)
    except TelegramAPIError:
        return False
    current = storage.get_choice(user_id, NOTICE_PREFIX + notice_hex, 0)
    latest_preference = storage.get_choice(user_id, pref_key, 0) or {}
    if current and current.get("muted"):
        if not storage.is_temporary_message(user_id, message.message_id):
            storage.add_temporary_message(user_id, user_id, message.message_id, 15)
        storage.set_choices(user_id, NOTICE_PREFIX + notice_hex, [])
    elif current is None or (latest_preference.get("enabled") is False and latest_preference.get("changedAt", 0) >= snapshot_started):
        # The captain may have opened the profile while Telegram acknowledged
        # this send. Do not resurrect the consumed notification's controls.
        storage.add_temporary_message(user_id, user_id, message.message_id, 0)
    else:
        storage.set_choices(user_id, NOTICE_PREFIX + notice_hex, [{**saved, "messageId": message.message_id}])
    return True


async def consume_application_notice(bot, storage, user_id, notice_hex, message_id=None):
    saved = storage.get_choice(user_id, NOTICE_PREFIX + notice_hex, 0) or {}
    message_id = saved.get("messageId") or message_id
    panel = storage.get_panel(user_id)
    if message_id and (not panel or panel.chat_id != user_id or panel.message_id != message_id):
        try:
            await bot.delete_message(user_id, message_id)
        except TelegramAPIError:
            storage.add_temporary_message(user_id, user_id, message_id, 0)
            try:
                await bot.edit_message_reply_markup(chat_id=user_id, message_id=message_id, reply_markup=None)
            except TelegramAPIError:
                pass
    storage.set_choices(user_id, NOTICE_PREFIX + notice_hex, [])


async def consume_request_notices(bot, storage, user_id, request_id):
    with storage.lock:
        rows = storage._connection().execute(
            "SELECT kind FROM callback_choices WHERE telegram_user_id=? AND kind GLOB ? AND json_extract(items_json, '$[0].requestId')=?",
            (user_id, NOTICE_PREFIX + "*", request_id),
        ).fetchall()
    for row in rows:
        await consume_application_notice(bot, storage, user_id, row["kind"][len(NOTICE_PREFIX):])
