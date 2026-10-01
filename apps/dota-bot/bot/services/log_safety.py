import logging
import re


class TelegramTokenRedactionFilter(logging.Filter):
    """Prevent Telegram bot tokens from appearing in application logs."""

    _token_pattern = re.compile(r"(?i)(?:bot)?\d{5,}:[A-Z0-9_-]{20,}")

    def filter(self, record: logging.LogRecord) -> bool:
        message = record.getMessage()
        record.msg = self._token_pattern.sub("<telegram-token-redacted>", message)
        record.args = ()

        if record.exc_info:
            formatted = logging.Formatter().formatException(record.exc_info)
            record.exc_text = self._token_pattern.sub(
                "<telegram-token-redacted>", formatted
            )
            record.exc_info = None
        elif record.exc_text:
            record.exc_text = self._token_pattern.sub(
                "<telegram-token-redacted>", record.exc_text
            )
        return True
