import logging
from urllib.parse import quote, urlencode

from aiogram.exceptions import TelegramAPIError
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from .start_links import bot_friend_invite_url

logger = logging.getLogger(__name__)


def referral_invitation_text(link: str) -> str:
    return (
        f"Привет, да я твой друг и я тебе рекомендую бота - {link},  "
        "заходи и приглашай всех своих друзей быстро.. пожалуйста..\n"
        "это я твой друг реально не  взломали меня"
    )


async def referral_share_keyboard(bot, storage, user_id: int) -> InlineKeyboardMarkup | None:
    try:
        me = await bot.me()
    except TelegramAPIError:
        # A bot username lookup must not prevent delivery of the welcome message.
        logger.warning("Could not look up Telegram bot username for sharing")
        return None
    if not me.username:
        return None
    # Reuse the recipient's existing public referral code, never an auth token.
    link = bot_friend_invite_url(me.username, storage.referral_code(user_id))
    # Native clients insert this field as plain text. Keeping the whole message
    # together preserves the requested link position without duplicating it.
    query = urlencode({"url": referral_invitation_text(link)}, quote_via=quote)
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text="📤 Поделиться",
            url=f"https://t.me/share/url?{query}",
        ),
    ]])
