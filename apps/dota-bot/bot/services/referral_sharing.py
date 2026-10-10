from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

REFERRAL_SHARE_CALLBACK = "welcome:share"
REFERRAL_INVITATION_TTL_SECONDS = 10


def referral_invitation_text(link: str) -> str:
    return (
        f"Привет, да я твой друг и я тебе рекомендую бота - {link},  "
        "заходи и приглашай всех своих друзей быстро.. пожалуйста..\n"
        "это я твой друг реально не  взломали меня"
    )


def referral_share_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text="📤 Поделиться",
            callback_data=REFERRAL_SHARE_CALLBACK,
        ),
    ]])
