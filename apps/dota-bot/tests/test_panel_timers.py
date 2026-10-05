import unittest
from unittest.mock import patch

from bot.services.panel import LFG_WINDOW_SECONDS, format_duration, search_elapsed_seconds


class SearchTimerTests(unittest.TestCase):
    def test_search_elapsed_is_not_capped_at_twenty_minutes(self) -> None:
        self.assertEqual(LFG_WINDOW_SECONDS, 30 * 60)
        with patch("bot.services.panel.time.time", return_value=3000):
            self.assertEqual(search_elapsed_seconds(None, 1500), 25 * 60)
            self.assertEqual(search_elapsed_seconds(None, 0), 30 * 60)

    def test_fallback_timer_uses_thirty_minutes(self) -> None:
        with patch("bot.services.panel.remaining_seconds", return_value=5 * 60):
            elapsed = search_elapsed_seconds("deadline")
            self.assertEqual(elapsed, 25 * 60)
            self.assertEqual(format_duration(elapsed), "25:00")

    def test_missing_deadline_and_future_start_do_not_show_negative_time(self) -> None:
        self.assertEqual(search_elapsed_seconds(None), 0)
        with patch("bot.services.panel.time.time", return_value=1000):
            self.assertEqual(search_elapsed_seconds(None, 1100), 0)
        with patch("bot.services.panel.remaining_seconds", return_value=30 * 60 + 1):
            self.assertEqual(search_elapsed_seconds("deadline"), 0)
