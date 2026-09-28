from pathlib import Path
import sqlite3
import tempfile
import unittest
from datetime import UTC, datetime, timedelta

from cryptography.fernet import Fernet

from bot.storage.database import BotStorage


class BotStorageTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.database_path = str(Path(self.tempdir.name) / "bot.db")
        self.key = Fernet.generate_key()
        self.storage = BotStorage(self.database_path, self.key)
        self.storage.initialize()

    def tearDown(self) -> None:
        self.storage.close()
        self.tempdir.cleanup()

    def test_auth_and_recovery_secrets_are_encrypted_at_rest(self) -> None:
        self.storage.save_session(7, "access-secret", "refresh-secret", "https://opinia/recover/secret")
        session = self.storage.get_session(7)
        self.assertEqual(session.access_token, "access-secret")
        self.assertEqual(session.refresh_token, "refresh-secret")
        self.assertEqual(session.recovery_url, "https://opinia/recover/secret")

        connection = sqlite3.connect(self.database_path)
        try:
            row = connection.execute(
                "SELECT access_token, refresh_token, recovery_url FROM telegram_sessions WHERE telegram_user_id = 7"
            ).fetchone()
        finally:
            connection.close()
        self.assertNotIn(b"access-secret", row[0])
        self.assertNotIn(b"refresh-secret", row[1])
        self.assertNotIn(b"/recover/secret", row[2])

    def test_panel_and_callback_choices_survive_reopen(self) -> None:
        self.storage.save_panel(7, 7, 101, "home")
        self.storage.set_choices(7, "candidates", [{"mode": "looking", "items": [{"slug": "player"}]}])
        self.storage.close()

        reopened = BotStorage(self.database_path, self.key)
        reopened.initialize()
        self.assertEqual(reopened.get_panel(7).message_id, 101)
        choice = reopened.get_choice(7, "candidates", 0)
        self.assertEqual(choice["items"][0]["slug"], "player")
        reopened.close()

    def test_panel_media_type_updates_when_fallback_changes(self) -> None:
        self.storage.save_panel(7, 7, 101, "home", is_photo=True)
        self.storage.save_panel(7, 7, 101, "profile", is_photo=False)
        self.assertFalse(self.storage.get_panel(7).is_photo)

    def test_panel_position_refresh_waits_until_user_is_inactive(self) -> None:
        self._make_panel_due(7)
        idle_for = timedelta(hours=48)
        screens = ("home",)

        self.assertEqual(self.storage.due_panel_refresh_user_ids(idle_for, screens), [7])
        self.storage.record_bot_user(7)
        self.assertEqual(self.storage.due_panel_refresh_user_ids(idle_for, screens), [])

    def test_party_notification_delays_panel_position_refresh(self) -> None:
        self._make_panel_due(7)
        idle_for = timedelta(hours=48)
        screens = ("home",)

        self.storage.record_party_notification(7)

        self.assertEqual(self.storage.due_panel_refresh_user_ids(idle_for, screens), [])

    def test_panel_refresh_is_independent_from_broadcast_opt_out(self) -> None:
        self.storage.record_bot_user(7)
        self.storage.set_announcements_enabled(7, False)
        self._make_panel_due(7)

        self.assertEqual(
            self.storage.due_panel_refresh_user_ids(timedelta(hours=48), ("home",)),
            [7],
        )

    def test_editing_panel_does_not_reset_position_timer_but_replacing_does(self) -> None:
        self.storage.save_panel(7, 7, 101, "home")
        old_timestamp = (datetime.now(UTC) - timedelta(days=3)).isoformat()
        connection = self.storage._connection()
        connection.execute(
            "UPDATE bot_panels SET last_panel_bumped_at = ? WHERE telegram_user_id = 7",
            (old_timestamp,),
        )
        connection.commit()

        self.storage.save_panel(7, 7, 101, "profile")
        row = connection.execute(
            "SELECT last_panel_bumped_at FROM bot_panels WHERE telegram_user_id = 7"
        ).fetchone()
        self.assertEqual(row[0], old_timestamp)

        self.storage.save_panel(7, 7, 102, "profile")
        row = connection.execute(
            "SELECT last_panel_bumped_at FROM bot_panels WHERE telegram_user_id = 7"
        ).fetchone()
        self.assertGreater(row[0], old_timestamp)

    def test_linking_a_website_account_clears_guest_recovery_url(self) -> None:
        self.storage.save_session(7, "guest-access", "guest-refresh", "https://opinia/recover/guest")
        self.storage.save_session(
            7,
            "linked-access",
            "linked-refresh",
            clear_recovery_url=True,
        )
        self.assertIsNone(self.storage.get_session(7).recovery_url)

    def test_acquisition_source_and_funnel_milestones_are_first_touch_and_deduplicated(self) -> None:
        self.storage.record_bot_user(7, "seo")
        self.storage.record_bot_user(7, "community")
        self.storage.record_funnel_event(7, "account_ready")
        self.storage.record_funnel_event(7, "account_ready")
        self.storage.record_funnel_event(7, "search_started")

        stats = self.storage.bot_acquisition_stats()
        self.assertEqual(stats["sources"], {"seo": 1})
        self.assertEqual(
            stats["funnel"]["seo"],
            {"bot_started": 1, "account_ready": 1, "search_started": 1},
        )

    def test_existing_database_users_migrate_to_unknown_source(self) -> None:
        self.storage.close()
        connection = sqlite3.connect(self.database_path)
        connection.execute("DROP TABLE bot_users")
        connection.execute(
            """CREATE TABLE bot_users (
                 telegram_user_id INTEGER PRIMARY KEY,
                 first_seen_at TEXT NOT NULL,
                 last_seen_at TEXT NOT NULL,
                 announcements_enabled INTEGER NOT NULL DEFAULT 1,
                 blocked_at TEXT
               )"""
        )
        connection.execute(
            "INSERT INTO bot_users (telegram_user_id, first_seen_at, last_seen_at) VALUES (7, 'old', 'old')"
        )
        connection.commit()
        connection.close()

        migrated = BotStorage(self.database_path, self.key)
        migrated.initialize()
        try:
            stats = migrated.bot_acquisition_stats()
            self.assertEqual(stats["sources"], {"existing": 1})
            self.assertEqual(stats["funnel"]["existing"]["bot_started"], 1)
        finally:
            migrated.close()

    def test_auto_match_skips_previously_invited_players_until_search_restarts(self) -> None:
        self.storage.save_session(7, "access", "refresh")
        self.storage.save_session(9, "access-two", "refresh-two")
        self.storage.exclude_auto_match_target(7, "player-one")
        self.storage.exclude_auto_match_target(9, "player-two")

        self.assertEqual(self.storage.session_user_ids(), [7, 9])
        self.assertEqual(self.storage.auto_match_exclusions(7), {"player-one"})
        self.storage.clear_auto_match_exclusions(7)
        self.assertEqual(self.storage.auto_match_exclusions(7), set())

    def _make_panel_due(self, telegram_user_id: int) -> None:
        self.storage.record_bot_user(telegram_user_id)
        self.storage.save_panel(telegram_user_id, telegram_user_id, 101, "home")
        old_timestamp = (datetime.now(UTC) - timedelta(days=3)).isoformat()
        connection = self.storage._connection()
        connection.execute(
            "UPDATE bot_panels SET last_panel_bumped_at = ? WHERE telegram_user_id = ?",
            (old_timestamp, telegram_user_id),
        )
        connection.execute(
            "UPDATE bot_users SET last_seen_at = ?, last_party_notification_at = NULL "
            "WHERE telegram_user_id = ?",
            (old_timestamp, telegram_user_id),
        )
        connection.commit()


if __name__ == "__main__":
    unittest.main()
