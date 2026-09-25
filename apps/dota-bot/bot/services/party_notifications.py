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
) -> None:
    next_path = f"/dota/teams/{party_slug}"
    try:
        ticket = await api.create_web_access_ticket(telegram_user_id)
        link = (
            f"{site_url.rstrip('/')}/telegram/access?ticket={quote(ticket, safe='')}"
            f"&next={quote(next_path, safe='')}"
        )
        open_button = button_url("Открыть пати на сайте", link)
    except ApiError:
        # Keep the existing Telegram Login flow as a fallback if ticket issuance is unavailable.
        link = f"{site_url.rstrip('/')}/telegram/access?next={quote(next_path, safe='')}"
        open_button = button_login("Открыть пати на сайте", link)
    message = await bot.send_message(
        telegram_user_id,
        "Вы теперь в пати! Общайтесь в чате на сайте или переходите в Discord.",
        reply_markup=InlineKeyboardMarkup(
            inline_keyboard=[
                [open_button]
            ]
        ),
    )
    storage.add_temporary_message(telegram_user_id, message.chat.id, message.message_id, 10)
