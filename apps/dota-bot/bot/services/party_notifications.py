from urllib.parse import quote

from aiogram.types import InlineKeyboardMarkup

from ..api.client import ApiError
from ..storage.database import BotStorage
from ..ui.keyboards import button_login, button_url
from .temporary_notifications import send_temporary_notification
from .party_ready import deliver_party_ready_notice


async def deliver_join_hint(
    bot,
    api,
    storage: BotStorage,
    telegram_user_id: int,
    site_url: str,
    party_slug: str,
    *,
    message_text: str = "Вы теперь в пати! Общайтесь в чате на сайте или переходите в Discord.",
    button_text: str = "Открыть пати на сайте",
) -> None:
    if party_slug:
        await deliver_party_ready_notice(
            bot, api, storage, telegram_user_id, site_url, party_slug,
            "🎮 <b>Пати найдена!</b>\n" + message_text,
        )
        return
    next_path = f"/dota/teams/{party_slug}"
    try:
        ticket = await api.create_web_access_ticket(telegram_user_id)
        link = (
            f"{site_url.rstrip('/')}/telegram/access?ticket={quote(ticket, safe='')}"
            f"&next={quote(next_path, safe='')}"
        )
        open_button = button_url(button_text, link)
    except ApiError:
        # Keep the existing Telegram Login flow as a fallback if ticket issuance is unavailable.
        link = f"{site_url.rstrip('/')}/telegram/access?next={quote(next_path, safe='')}"
        open_button = button_login(button_text, link)
    await send_temporary_notification(
        bot,
        storage,
        telegram_user_id,
        telegram_user_id,
        message_text,
        20,
        reply_markup=InlineKeyboardMarkup(
            inline_keyboard=[
                [open_button]
            ]
        ),
    )
    storage.record_party_notification(telegram_user_id)


async def deliver_member_joined_notice(
    bot,
    api,
    storage: BotStorage,
    telegram_user_id: int,
    site_url: str,
    party_slug: str,
    message_text: str,
) -> None:
    """Keep coordination visible until the participant confirms readiness."""
    if party_slug:
        await deliver_join_hint(
            bot,
            api,
            storage,
            telegram_user_id,
            site_url,
            party_slug,
            message_text=(
                f"{message_text}\n\n"
                "💬 Зайдите в чат пати, чтобы договориться об игре. "
                "Нажмите кнопку ниже или «Чат и Discord» в основном окне пати."
            ),
            button_text="💬 Открыть чат пати",
        )
        # A failed delivery must not consume one of the two reminders.
        return

    await send_temporary_notification(
        bot,
        storage,
        telegram_user_id,
        telegram_user_id,
        message_text,
        10,
        parse_mode="HTML",
    )
    storage.record_party_notification(telegram_user_id)
