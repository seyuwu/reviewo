import json
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, Mock

from bot.api.client import ApiError, OpiniaApi, extract_error_message


class ApiErrorTests(unittest.IsolatedAsyncioTestCase):
    async def test_actual_api_error_envelope_reaches_bot_caller(self):
        # Envelope returned by the running local API for a closed search gate.
        body = {
            "error": {"code": "FORBIDDEN", "message": "Teammate search is not open yet"},
            "path": "/dota/profiles/lfg/looking", "statusCode": 403,
        }
        response = SimpleNamespace(status=403, text=AsyncMock(return_value=json.dumps(body)))
        context = AsyncMock()
        context.__aenter__.return_value = response
        api = OpiniaApi(SimpleNamespace(api_base_url="http://127.0.0.1:32207"), None)
        api.session = SimpleNamespace(request=Mock(return_value=context))
        with self.assertRaises(ApiError) as result:
            await api.public("POST", "/dota/profiles/lfg/looking", {"looking": True, "source": "telegram"})
        self.assertEqual(result.exception.status, 403)
        self.assertEqual(str(result.exception), "Teammate search is not open yet")

    def test_legacy_and_validation_messages_still_work(self):
        self.assertEqual(extract_error_message({"message": "legacy"}), "legacy")
        self.assertEqual(extract_error_message({"message": ["one", "two"]}), "one; two")
        self.assertIsNone(extract_error_message("<html>proxy error</html>"))
