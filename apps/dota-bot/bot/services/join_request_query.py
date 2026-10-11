from typing import Literal

from aiogram.methods.base import TelegramMethod


class AnswerChatJoinRequestQuery(TelegramMethod[bool]):
    """Support the native guard response even with an older aiogram schema."""

    __returning__ = bool
    __api_method__ = "answerChatJoinRequestQuery"

    chat_join_request_query_id: str
    result: Literal["approve", "decline", "queue"]
