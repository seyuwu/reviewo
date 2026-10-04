import unittest

from bot.ui.keyboards import home_keyboard


class HomeKeyboardTests(unittest.TestCase):
    def test_registered_home_has_tournaments_link_below_account(self) -> None:
        keyboard = home_keyboard(True, False, site_url="https://dota.example/")

        self.assertEqual(keyboard.inline_keyboard[1][0].callback_data, "panel:account")
        tournament_button = keyboard.inline_keyboard[2][0]
        self.assertEqual(tournament_button.text, "🏆 Турниры")
        self.assertEqual(tournament_button.url, "https://dota.example/games/tournaments")
        self.assertIsNone(tournament_button.callback_data)

    def test_unregistered_home_can_open_tournaments_without_account_button(self) -> None:
        keyboard = home_keyboard(False, False)

        self.assertEqual(len(keyboard.inline_keyboard), 2)
        self.assertEqual(keyboard.inline_keyboard[-1][0].text, "🏆 Турниры")
        self.assertEqual(
            keyboard.inline_keyboard[-1][0].url,
            "https://dota.opinia.ru/games/tournaments",
        )


if __name__ == "__main__":
    unittest.main()
