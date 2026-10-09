import asyncio
import logging
import time
from datetime import UTC, datetime
from html import escape
from urllib.parse import quote

from aiogram.exceptions import TelegramAPIError, TelegramBadRequest, TelegramForbiddenError, TelegramNetworkError
from aiogram.types import InlineKeyboardMarkup

from ..api.client import ApiError
from ..ui.formatters import telegram_contact_text
from ..ui.keyboards import button, button_login, button_url
from .party_coordination import coordination_context, notice_deadline, own_member, read_coordination
from .temporary_notifications import send_temporary_notification
from .telegram_session import is_connection_setup_failure

logger = logging.getLogger(__name__)
_links = {}
_delivery_locks = {}
ROLE_NAMES = {"1": "Керри", "2": "Мид", "3": "Оффлейн", "4": "Саппорт", "5": "Хард-саппорт"}


def notice_key(token):
    return "party_ready_notice:" + token


def expire_ready_notice(storage, user_id, token):
    notice = storage.get_choice(user_id, notice_key(token), 0)
    if isinstance(notice, dict):
        for field in ("messageId", "reminderMessageId"):
            if notice.get(field):
                storage.add_temporary_message(user_id, notice["chatId"], notice[field], 1)
    storage.set_choices(user_id, notice_key(token), [])
    _links.pop((user_id, token), None)


async def open_chat_button(api, user_id, site_url, slug, token, *, force=False):
    key = (user_id, token)
    cached = _links.get(key)
    if not force and cached and cached[1] > time.time():
        return cached[0]
    next_path = f"/dota/teams/{slug}#party-chat"
    try:
        ticket = await api.create_web_access_ticket(user_id)
        url = f"{site_url.rstrip('/')}/telegram/access?ticket={quote(ticket, safe='')}&next={quote(next_path, safe='')}"
        item = button_url("💬 Открыть чат пати", url)
    except ApiError:
        url = f"{site_url.rstrip('/')}/telegram/access?next={quote(next_path, safe='')}"
        item = button_login("💬 Открыть чат пати", url)
    # Login tickets remain short-lived and single-use. Never persist them in a notice.
    _links[key] = (item, time.time() + 8 * 60)
    return item


async def ready_notice_markup(api, user_id, site_url, coordination, token, *, force_link=False):
    rows = [
        [await open_chat_button(api, user_id, site_url, coordination["slug"], token, force=force_link)],
        [button("✅ Готов играть", f"party:ready:{token}:on")],
    ]
    member = own_member(coordination)
    if member and member.get("telegramUsername") and not member.get("telegramContactPublic"):
        share = not member.get("telegramContactShared")
        rows.append([button("📨 Показать мой Telegram пати" if share else "🔒 Скрыть мой Telegram в пати", f"party:contact:{token}:{'on' if share else 'off'}")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def ready_notice_text(coordination, heading, *, needs_confirmation=True):
    member = own_member(coordination)
    position = ROLE_NAMES.get(str((member or {}).get("positionRole")), "не выбрана")
    lines = [heading, "", f"<b>{escape(str(coordination['name']))}</b>", f"🎯 Твоя позиция: <b>{escape(position)}</b>",
             f"Состав: <b>{len(coordination['members'])}/{coordination['maxMembers']}</b>", ""]
    for player in coordination["members"]:
        role = ROLE_NAMES.get(str(player.get("positionRole")), "без позиции")
        status = "✅" if player.get("readyAt") else "❌"
        lines.append(f"{status} <b>{escape(str(player['displayName'])[:40])}</b> · {escape(role)}")
        contact = telegram_contact_text(player)
        if contact:
            lines.append("   📱 " + contact)
    lines.extend(["", "Нажми «Готов играть», чтобы остальные участники увидели твою готовность."
                  if needs_confirmation else "Обсудите игру в чате пати или Discord."])
    return "\n".join(lines)


async def deliver_party_ready_notice(bot, api, storage, user_id, site_url, slug, heading):
    lock = _delivery_locks.setdefault(user_id, asyncio.Lock())
    async with lock:
        try:
            coordination = await read_coordination(api, user_id, slug)
        except ApiError as error:
            if error.status in {403, 404}:
                # A delayed join event must not invite a former member back into a private chat.
                return
            raise
        member = own_member(coordination)
        if len(coordination["members"]) < 2:
            return
        context = coordination_context(storage, user_id, coordination)
        token = context["token"]
        roster = sorted(player["membershipId"] for player in coordination["members"])
        seen_key = "party_ready_roster:" + token
        seen = storage.get_choice(user_id, seen_key, 0)
        if member.get("readyAt"):
            if isinstance(seen, dict) and seen.get("roster") == roster:
                return
            text = ready_notice_text(coordination, heading, needs_confirmation=False)
            open_button = await open_chat_button(api, user_id, site_url, coordination["slug"], token, force=True)
            await send_temporary_notification(bot, storage, user_id, user_id, text, 20, parse_mode="HTML",
                                             reply_markup=InlineKeyboardMarkup(inline_keyboard=[[open_button]]), disable_web_page_preview=True, protect_content=True)
            storage.set_choices(user_id, seen_key, [{"roster": roster}])
            return
        text = ready_notice_text(coordination, heading)
        markup = await ready_notice_markup(api, user_id, site_url, coordination, token)
        existing = storage.get_choice(user_id, notice_key(token), 0)
        if isinstance(existing, dict):
            if not existing.get("messageId"):
                # An uncertain transport response must not duplicate the initial message.
                return
            try:
                await bot.edit_message_text(text, chat_id=existing["chatId"], message_id=existing["messageId"],
                                            reply_markup=markup, parse_mode="HTML", disable_web_page_preview=True)
            except TelegramBadRequest as error:
                if "not modified" not in str(error).lower():
                    expire_ready_notice(storage, user_id, token)
                    raise
            existing.update(heading=heading, text=text)
            storage.set_choices(user_id, notice_key(token), [existing])
            storage.set_choices(user_id, seen_key, [{"roster": roster}])
            return
        deadline = notice_deadline(coordination)
        ttl = int((deadline - datetime.now(UTC)).total_seconds())
        if ttl <= 0:
            return
        notice = {
            **context, "chatId": user_id, "messageId": None,
            "heading": heading, "text": text, "expiresAt": deadline.isoformat(),
            "createdAt": time.time(), "reminded": False,
        }
        storage.set_choices(user_id, notice_key(token), [notice])
        try:
            message = await bot.send_message(user_id, text, reply_markup=markup, parse_mode="HTML", disable_web_page_preview=True, protect_content=True)
        except TelegramNetworkError as error:
            if is_connection_setup_failure(error):
                storage.set_choices(user_id, notice_key(token), [])
            raise
        if not storage.get_choice(user_id, notice_key(token), 0):
            storage.add_temporary_message(user_id, message.chat.id, message.message_id, 1)
            return
        notice.update(chatId=message.chat.id, messageId=message.message_id)
        storage.set_choices(user_id, notice_key(token), [notice])
        storage.set_choices(user_id, seen_key, [{"roster": roster}])
        storage.add_temporary_message(user_id, message.chat.id, message.message_id, 24 * 60 * 60)
        storage.record_party_notification(user_id)


async def refresh_ready_notice(bot, api, settings, storage, notice):
    user_id, token = notice["userId"], notice["token"]
    if time.time() - notice["createdAt"] >= 24 * 60 * 60:
        expire_ready_notice(storage, user_id, token)
        return
    try:
        coordination = await read_coordination(api, user_id, notice["partySlug"])
    except ApiError as error:
        if error.status in {403, 404}:
            expire_ready_notice(storage, user_id, token)
            return
        raise
    member = own_member(coordination)
    if coordination["id"] != notice["partyId"] or member["membershipId"] != notice["membershipId"] or member.get("readyAt") or len(coordination["members"]) < 2:
        expire_ready_notice(storage, user_id, token)
        return
    if not storage.get_choice(user_id, notice_key(token), 0):
        return
    text = ready_notice_text(coordination, notice["heading"])
    cached_link = _links.get((user_id, token))
    refresh_link = not cached_link or cached_link[1] <= time.time()
    if notice.get("messageId") and (text != notice.get("text") or refresh_link):
        markup = await ready_notice_markup(api, user_id, settings.site_url, coordination, token)
        await bot.edit_message_text(text, chat_id=notice["chatId"], message_id=notice["messageId"],
                                    reply_markup=markup, parse_mode="HTML", disable_web_page_preview=True)
        if notice.get("reminderMessageId"):
            await bot.edit_message_reply_markup(chat_id=notice["chatId"], message_id=notice["reminderMessageId"], reply_markup=markup)
        notice["text"] = text
        if storage.get_choice(user_id, notice_key(token), 0):
            storage.set_choices(user_id, notice_key(token), [notice])
    if not notice.get("reminded") and time.time() - notice["createdAt"] >= 2 * 60:
        # Reserve before sending: transport failures must not produce duplicate reminders.
        if not storage.get_choice(user_id, notice_key(token), 0):
            return
        notice["reminded"] = True
        storage.set_choices(user_id, notice_key(token), [notice])
        markup = await ready_notice_markup(api, user_id, settings.site_url, coordination, token, force_link=True)
        if notice.get("messageId"):
            await bot.edit_message_reply_markup(chat_id=notice["chatId"], message_id=notice["messageId"], reply_markup=markup)
        message = await bot.send_message(user_id, "⏰ Пати ждёт твоего подтверждения. Нажми «Готов играть», если готов начинать.",
                                         reply_markup=markup, disable_web_page_preview=True, protect_content=True)
        if not storage.get_choice(user_id, notice_key(token), 0):
            storage.add_temporary_message(user_id, message.chat.id, message.message_id, 1)
            return
        notice["reminderMessageId"] = message.message_id
        storage.set_choices(user_id, notice_key(token), [notice])
        storage.add_temporary_message(user_id, message.chat.id, message.message_id, max(1, int(notice["createdAt"] + 24 * 60 * 60 - time.time())))


async def party_ready_notice_worker(bot, api, settings, storage):
    while True:
        for notice in storage.party_ready_notices():
            try:
                await refresh_ready_notice(bot, api, settings, storage, notice)
            except TelegramForbiddenError:
                storage.mark_bot_user_blocked(notice["userId"])
                expire_ready_notice(storage, notice["userId"], notice["token"])
            except TelegramBadRequest as error:
                if "not modified" not in str(error).lower():
                    expire_ready_notice(storage, notice["userId"], notice["token"])
            except (ApiError, TelegramAPIError):
                logger.warning("Could not refresh party readiness notice; will retry")
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Party readiness notice refresh failed")
        await asyncio.sleep(30)
