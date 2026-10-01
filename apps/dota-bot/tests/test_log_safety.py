import logging
import sys
import unittest

from bot.services.log_safety import TelegramTokenRedactionFilter


class TelegramTokenRedactionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.token = "bot123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
        self.redactor = TelegramTokenRedactionFilter()

    def test_redacts_tokens_from_formatted_log_messages(self) -> None:
        record = logging.LogRecord(
            "test", logging.ERROR, __file__, 1, "Request failed: %s", (self.token,), None
        )

        self.assertTrue(self.redactor.filter(record))
        self.assertNotIn(self.token, record.getMessage())
        self.assertIn("<telegram-token-redacted>", record.getMessage())

    def test_redacts_tokens_from_exception_tracebacks(self) -> None:
        try:
            raise RuntimeError(f"Request timed out: https://api.telegram.org/{self.token}/getMe")
        except RuntimeError:
            exception_info = sys.exc_info()

        record = logging.LogRecord(
            "test", logging.ERROR, __file__, 1, "Telegram request failed", (), None
        )
        record.exc_info = exception_info

        self.assertTrue(self.redactor.filter(record))
        self.assertIsNone(record.exc_info)
        self.assertNotIn(self.token, record.exc_text or "")
        self.assertIn("<telegram-token-redacted>", record.exc_text or "")


if __name__ == "__main__":
    unittest.main()
