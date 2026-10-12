import asyncio
from types import SimpleNamespace
import unittest

import aiohttp

from bot.api.client import ApiError, OpiniaApi


class ResponseContext:
    def __init__(self, error=None, status=200, text='{}'):
        self.error = error
        self.response = SimpleNamespace(status=status, text=self.text)
        self.body = text

    async def text(self):
        return self.body

    async def __aenter__(self):
        if self.error:
            raise self.error
        return self.response

    async def __aexit__(self, *args):
        return False


class ApiFailureTests(unittest.IsolatedAsyncioTestCase):
    def client(self, context):
        client = OpiniaApi(SimpleNamespace(api_base_url="https://isolated.invalid"), SimpleNamespace())
        client.session = SimpleNamespace(request=lambda *args, **kwargs: context)
        return client

    async def test_main_api_timeout_becomes_a_handled_api_error(self):
        for error in (TimeoutError("read timed out"), asyncio.TimeoutError("connect timed out")):
            with self.subTest(error=str(error)):
                with self.assertRaises(ApiError) as caught:
                    await self.client(ResponseContext(error=error)).public("GET", "/dota/tournaments")
                self.assertEqual(caught.exception.status, 0)
                self.assertIn("Попробуйте ещё раз", str(caught.exception))

    async def test_main_api_connection_failure_remains_a_handled_api_error(self):
        with self.assertRaises(ApiError):
            await self.client(ResponseContext(error=aiohttp.ClientConnectionError("offline"))).public("GET", "/dota/tournaments")

    async def test_server_status_and_message_are_not_replaced_by_network_fallback(self):
        with self.assertRaises(ApiError) as caught:
            await self.client(ResponseContext(status=409, text='{"error":{"message":"Position taken"}}')).public("GET", "/dota/tournaments")
        self.assertEqual(caught.exception.status, 409)
        self.assertEqual(str(caught.exception), "Position taken")
