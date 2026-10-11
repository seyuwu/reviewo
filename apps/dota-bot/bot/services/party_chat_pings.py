from datetime import UTC, datetime
from html import escape
from urllib.parse import quote

from aiogram.exceptions import TelegramForbiddenError, TelegramNetworkError
from aiogram.types import InlineKeyboardMarkup

from ..api.client import ApiError
from .party_ready import open_chat_button
from .telegram_session import is_connection_setup_failure


async def deliver_party_chat_ping(bot, api, settings, storage, row):
    user_id = int(row["telegramUserId"])
    slug = str((row.get("payload") or {}).get("partySlug") or "")
    try:
        delivery = await api.user(user_id, "GET",
            f"/social/parties/{quote(slug, safe='')}/chat-pings/{quote(str(row['id']), safe='')}", bot_secret=True)
    except ApiError as error:
        if error.status in {401, 403, 404, 409}:
            return True
        raise
    if not delivery:
        return True
    expires_at = datetime.fromisoformat(delivery["expiresAt"].replace("Z", "+00:00"))
    if expires_at <= datetime.now(UTC):
        return True
    open_button = await open_chat_button(api, user_id, settings.site_url, delivery["partySlug"], str(row["id"]), force=True, cache=False)
    open_button = open_button.model_copy(update={"text": "💬 Открыть чат пати"})
    if expires_at <= datetime.now(UTC):
        return True
    text = (f"🔔 <b>{escape(str(delivery['senderName'])[:40])} зовёт тебя в чат пати «{escape(str(delivery['partyName'])[:80])}»</b>\n"
            "Зайди, чтобы договориться с командой.")
    try:
        message = await bot.send_message(user_id, text, parse_mode="HTML", disable_web_page_preview=True,
            protect_content=True, reply_markup=InlineKeyboardMarkup(inline_keyboard=[[open_button]]))
    except TelegramForbiddenError:
        return True
    except TelegramNetworkError as error:
        if is_connection_setup_failure(error):
            raise
        # A lost Telegram response can still mean delivery; do not send duplicates.
        return True
    ttl = max(1, int((expires_at - datetime.now(UTC)).total_seconds()))
    storage.track_party_notice(user_id, delivery["partyId"], (row.get("payload") or {}).get("targetMembershipId"), message.chat.id, message.message_id)
    storage.add_temporary_message(user_id, message.chat.id, message.message_id, ttl)
    if getattr(api, "party_rooms", None) and api.party_rooms.enabled and open_button.url and open_button.url.startswith("https://t.me/"):
        storage.set_choices(user_id, "party_room_ping_link:" + delivery["partyId"], [{
            "messageId": message.message_id, "url": open_button.url, "chatId": message.chat.id,
            "partyId": delivery["partyId"], "membershipId": (row.get("payload") or {}).get("targetMembershipId"),
        }])
    return True
