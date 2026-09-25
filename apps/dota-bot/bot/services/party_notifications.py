from urllib.parse import quote

from aiogram.types import InlineKeyboardMarkup

from ..storage.database import BotStorage
from ..ui.keyboards import button_login


async def deliver_join_hint(
    bot,
    storage: BotStorage,
    telegram_user_id: int,
    site_url: str,
    party_slug: str,
) -> None:
    next_path = f"/dota/teams/{party_slug}"
    link = f"{site_url.rstrip('/')}/telegram/access?next={quote(next_path, safe='')}"
    message = await bot.send_message(
        telegram_user_id,
        "Вы теперь в пати! Общайтесь в чате на сайте или переходите в Discord.",
        reply_markup=InlineKeyboardMarkup(
            inline_keyboard=[
                [button_login("Открыть пати на сайте", link)]
            ]
        ),
    )
    storage.add_temporary_message(telegram_user_id, message.chat.id, message.message_id, 10)
