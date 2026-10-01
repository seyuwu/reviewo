from urllib.parse import quote

from aiogram.types import InlineKeyboardMarkup

from ..api.client import ApiError
from ..storage.database import BotStorage
from ..ui.keyboards import button_login, button_url


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
    message = await bot.send_message(
        telegram_user_id,
        message_text,
        reply_markup=InlineKeyboardMarkup(
            inline_keyboard=[
                [open_button]
            ]
        ),
    )
    storage.add_temporary_message(telegram_user_id, message.chat.id, message.message_id, 10)
    storage.record_party_notification(telegram_user_id)
