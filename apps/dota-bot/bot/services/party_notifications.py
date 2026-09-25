from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from ..storage.database import BotStorage


async def deliver_join_hint(
    bot,
    storage: BotStorage,
    telegram_user_id: int,
    site_url: str,
    party_slug: str,
) -> None:
    link = f"{site_url}/dota/teams/{party_slug}"
    message = await bot.send_message(
        telegram_user_id,
        "Вы теперь в пати! Общайтесь в чате на сайте или переходите в Discord.",
        reply_markup=InlineKeyboardMarkup(
            inline_keyboard=[
                [InlineKeyboardButton(text="Открыть пати на сайте", url=link)]
            ]
        ),
    )
    storage.add_temporary_message(telegram_user_id, message.chat.id, message.message_id, 10)
