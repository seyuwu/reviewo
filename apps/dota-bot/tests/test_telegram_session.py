import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from aiogram.client.session.aiohttp import AiohttpSession
from aiogram.exceptions import TelegramNetworkError
from aiogram.methods import GetMe, GetUpdates

from bot.services.telegram_session import (
    RetryingAiohttpSession,
    is_connection_setup_failure,
)


def make_network_error(failing_operation) -> TelegramNetworkError:
    method = GetMe()
    try:
        failing_operation()
    except TimeoutError as cause:
        try:
            raise TelegramNetworkError(method=method, message="Request timeout error") from cause
        except TelegramNetworkError as error:
            return error
    raise AssertionError("failing_operation must raise TimeoutError")


class TelegramSessionTests(unittest.IsolatedAsyncioTestCase):
    def test_identifies_connect_timeout_but_not_response_timeout(self) -> None:
        def _connect_sock() -> None:
            raise TimeoutError("connect timed out")

        def _read_response() -> None:
            raise TimeoutError("response timed out")

        self.assertTrue(is_connection_setup_failure(make_network_error(_connect_sock)))
        self.assertFalse(is_connection_setup_failure(make_network_error(_read_response)))

    async def test_retries_only_before_request_connection_is_established(self) -> None:
        session = RetryingAiohttpSession()
        bot = Mock()
        method = GetMe()

        def _connect_sock() -> None:
            raise TimeoutError("connect timed out")

        network_error = make_network_error(_connect_sock)
        with patch.object(AiohttpSession, "make_request", new_callable=AsyncMock) as parent_request:
            parent_request.side_effect = [network_error, "ok"]
            with patch("bot.services.telegram_session.asyncio.sleep", new_callable=AsyncMock) as sleep:
                result = await session.make_request(bot, method)

        self.assertEqual(result, "ok")
        self.assertEqual(parent_request.await_count, 2)
        sleep.assert_awaited_once_with(0.2)
        await session.close()

    async def test_does_not_retry_response_timeout_or_telegram_long_poll_timeout(self) -> None:
        session = RetryingAiohttpSession()
        bot = Mock()

        def _read_response() -> None:
            raise TimeoutError("response timed out")

        network_error = make_network_error(_read_response)
        with patch.object(AiohttpSession, "make_request", new_callable=AsyncMock) as parent_request:
            parent_request.side_effect = network_error
            with patch("bot.services.telegram_session.asyncio.sleep", new_callable=AsyncMock) as sleep:
                with self.assertRaises(TelegramNetworkError):
                    await session.make_request(bot, GetMe())
                self.assertEqual(parent_request.await_count, 1)
                sleep.assert_not_awaited()

        self.assertEqual(session._request_timeout(GetUpdates(), 25), 25)
        await session.close()


if __name__ == "__main__":
    unittest.main()
