from pathlib import Path
import sqlite3
import tempfile
import unittest

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

    def test_linking_a_website_account_clears_guest_recovery_url(self) -> None:
        self.storage.save_session(7, "guest-access", "guest-refresh", "https://opinia/recover/guest")
        self.storage.save_session(
            7,
            "linked-access",
            "linked-refresh",
            clear_recovery_url=True,
        )
        self.assertIsNone(self.storage.get_session(7).recovery_url)

    def test_auto_match_skips_previously_invited_players_until_search_restarts(self) -> None:
        self.storage.save_session(7, "access", "refresh")
        self.storage.save_session(9, "access-two", "refresh-two")
        self.storage.exclude_auto_match_target(7, "player-one")
        self.storage.exclude_auto_match_target(9, "player-two")

        self.assertEqual(self.storage.session_user_ids(), [7, 9])
        self.assertEqual(self.storage.auto_match_exclusions(7), {"player-one"})
        self.storage.clear_auto_match_exclusions(7)
        self.assertEqual(self.storage.auto_match_exclusions(7), set())


if __name__ == "__main__":
    unittest.main()
