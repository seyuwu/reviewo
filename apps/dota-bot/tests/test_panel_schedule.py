import asyncio
import sys
import unittest
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from bot.services.panel import (
    first_panel_position_refresh_at,
    following_panel_position_refresh_at,
    refresh_stale_panels,
)


class PanelScheduleTests(unittest.IsolatedAsyncioTestCase):
    def test_first_refresh_is_at_four_moscow_time(self) -> None:
        before_four = datetime(2026, 9, 30, 0, 30, tzinfo=UTC)
        after_four = datetime(2026, 9, 30, 1, 30, tzinfo=UTC)

        self.assertEqual(
            first_panel_position_refresh_at(before_four),
            datetime(2026, 9, 30, 1, 0, tzinfo=UTC),
        )
        self.assertEqual(
            first_panel_position_refresh_at(after_four),
            datetime(2026, 10, 1, 1, 0, tzinfo=UTC),
        )

    def test_following_refresh_keeps_two_day_cadence_at_four_moscow_time(self) -> None:
        scheduled_at = datetime(2026, 9, 30, 1, 0, tzinfo=UTC)

        self.assertEqual(
            following_panel_position_refresh_at(
                scheduled_at,
                scheduled_at + timedelta(hours=1),
            ),
            datetime(2026, 10, 2, 1, 0, tzinfo=UTC),
        )

    def test_missed_cycles_are_skipped_instead_of_replayed_back_to_back(self) -> None:
        scheduled_at = datetime(2026, 9, 30, 1, 0, tzinfo=UTC)
        now = scheduled_at + timedelta(days=5)

        self.assertEqual(
            following_panel_position_refresh_at(scheduled_at, now),
            datetime(2026, 10, 6, 1, 0, tzinfo=UTC),
        )

    async def test_scheduled_refresh_sends_silently_and_persists_next_cycle(self) -> None:
        scheduled_at = datetime.now(UTC) - timedelta(minutes=1)
        storage = SimpleNamespace(
            get_or_create_panel_refresh_schedule=Mock(
                side_effect=[scheduled_at, scheduled_at + timedelta(days=2)]
            ),
            due_panel_refresh_user_ids=Mock(return_value=[7]),
            get_panel=Mock(return_value=SimpleNamespace(
                screen="home",
                chat_id=7,
            )),
            panel_refresh_is_due=Mock(return_value=False),
            advance_panel_refresh_schedule=Mock(return_value=True),
            mark_bot_user_blocked=Mock(),
        )
        edit_panel = AsyncMock()
        sleep = AsyncMock(side_effect=[None, asyncio.CancelledError()])

        with (
            patch("bot.services.panel.edit_panel", new=edit_panel),
            patch("bot.services.panel.asyncio.sleep", new=sleep),
        ):
            with self.assertRaises(asyncio.CancelledError):
                await refresh_stale_panels(object(), object(), object(), storage)

        edit_panel.assert_awaited_once()
        self.assertTrue(edit_panel.await_args.kwargs["disable_notification"])
        self.assertTrue(edit_panel.await_args.kwargs["force_new_message"])
        self.assertEqual(edit_panel.await_args.kwargs["refresh_scheduled_at"], scheduled_at)
        storage.advance_panel_refresh_schedule.assert_called_once()


if __name__ == "__main__":
    unittest.main()
