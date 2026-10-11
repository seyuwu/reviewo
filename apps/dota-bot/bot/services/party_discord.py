from aiogram.methods.base import TelegramMethod
from aiogram.types import InlineKeyboardMarkup, Message


class SendPartyDiscordMessage(TelegramMethod[Message]):
    """Keep ephemeral responses available with older aiogram schemas."""

    __returning__ = Message
    __api_method__ = "sendMessage"

    chat_id: int
    text: str
    ephemeral_message_parameters: dict
    parse_mode: str = "HTML"
    reply_markup: InlineKeyboardMarkup | None = None


class EditPartyDiscordMessage(TelegramMethod[bool]):
    __returning__ = bool
    __api_method__ = "editEphemeralMessageText"

    chat_id: int
    receiver_user_id: int
    ephemeral_message_id: int
    text: str
    parse_mode: str = "HTML"
    reply_markup: InlineKeyboardMarkup | None = None
