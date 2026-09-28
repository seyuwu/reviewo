import asyncio
import logging

from aiohttp import ClientTimeout
from aiogram import Bot
from aiogram.client.session.aiohttp import AiohttpSession
from aiogram.exceptions import TelegramNetworkError

logger = logging.getLogger(__name__)

_CONNECTION_SETUP_FRAMES = frozenset(
    {
        "_resolve_host",
        "_resolve_host_with_throttle",
        "_create_connection",
        "_create_direct_connection",
        "_wrap_create_connection",
        "_connect_sock",
        "start_connection",
        "sock_connect",
    }
)


def is_connection_setup_failure(error: TelegramNetworkError) -> bool:
    """Only retry failures that happened before Telegram could receive a request."""
    pending = [error.__cause__, error.__context__]
    seen: set[int] = set()

    while pending:
        current = pending.pop()
        if current is None or id(current) in seen:
            continue
        seen.add(id(current))

        traceback_cursor = current.__traceback__
        while traceback_cursor is not None:
            if traceback_cursor.tb_frame.f_code.co_name in _CONNECTION_SETUP_FRAMES:
                return True
            traceback_cursor = traceback_cursor.tb_next

        pending.extend((current.__cause__, current.__context__))

    return False


class RetryingAiohttpSession(AiohttpSession):
    """Retry only connection-establishment failures, never uncertain writes."""

    max_connection_retries = 2
    connect_timeout_seconds = 5

    def _request_timeout(self, method, timeout):
        effective_timeout = self.timeout if timeout is None else timeout
        # Telegram long polling has its own long-poll timeout; don't shorten it.
        if method.__api_method__ == "getUpdates":
            return effective_timeout
        if not isinstance(effective_timeout, (int, float)):
            return effective_timeout

        connect_timeout = min(self.connect_timeout_seconds, effective_timeout)
        return ClientTimeout(
            total=effective_timeout,
            connect=connect_timeout,
            sock_connect=connect_timeout,
        )

    async def make_request(self, bot: Bot, method, timeout=None):
        request_timeout = self._request_timeout(method, timeout)
        for attempt in range(self.max_connection_retries + 1):
            try:
                return await super().make_request(bot, method, request_timeout)
            except TelegramNetworkError as error:
                if (
                    attempt >= self.max_connection_retries
                    or not is_connection_setup_failure(error)
                ):
                    raise

                retry_number = attempt + 1
                logger.warning(
                    "Telegram connection setup failed for %s; retry %d/%d",
                    method.__api_method__,
                    retry_number,
                    self.max_connection_retries,
                )
                await asyncio.sleep(0.2 * (2**attempt))

        raise AssertionError("unreachable")
