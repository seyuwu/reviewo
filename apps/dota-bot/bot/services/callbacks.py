import asyncio
import logging

from aiogram.exceptions import TelegramAPIError
from aiogram.types import CallbackQuery

logger = logging.getLogger(__name__)
_pending_acknowledgements: set[asyncio.Task[None]] = set()


def acknowledge_callback(
    callback: CallbackQuery,
    text: str | None = None,
) -> None:
    """Acknowledge a button tap without holding up the panel update."""

    async def acknowledge() -> None:
        try:
            await callback.answer(text=text)
        except TelegramAPIError as error:
            logger.debug("Could not acknowledge Telegram callback: %s", error)

    task = asyncio.create_task(acknowledge())
    _pending_acknowledgements.add(task)
    task.add_done_callback(_pending_acknowledgements.discard)
