import unittest

from bot.ui.formatters import notification_text, party_text


class FormatterTests(unittest.TestCase):
    def test_system_cancellation_is_not_reported_as_a_player_decline(self) -> None:
        text = notification_text(
            {
                "type": "declined",
                "invite": {"partyName": "Dota party", "status": "CANCELLED"},
            }
        )
        self.assertIn("закрыто", text)
        self.assertNotIn("отклонены", text)

    def test_party_roster_escapes_user_content(self) -> None:
        text = party_text(
            {
                "name": "<script>",
                "memberCount": 1,
                "maxMembers": 5,
                "openSlots": 4,
                "members": [{"displayName": "<b>player</b>", "positionRole": "1", "mmr": "5000"}],
            }
        )
        self.assertNotIn("<script>", text)
        self.assertIn("&lt;script&gt;", text)


if __name__ == "__main__":
    unittest.main()
