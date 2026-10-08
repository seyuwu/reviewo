import unittest

from bot.ui.keyboards import account_keyboard, home_keyboard, onboarding_keyboard


class HomeKeyboardTests(unittest.TestCase):
    def test_registered_home_has_tournaments_link_below_account(self) -> None:
        keyboard = home_keyboard(True, False, site_url="https://dota.example/")

        self.assertEqual(keyboard.inline_keyboard[1][0].callback_data, "panel:account")
        tournament_button = keyboard.inline_keyboard[2][0]
        self.assertEqual(tournament_button.text, "🏆 Турниры")
        self.assertEqual(tournament_button.url, "https://dota.example/games/tournaments")
        self.assertIsNone(tournament_button.callback_data)

    def test_unregistered_home_can_open_account_and_tournaments(self) -> None:
        keyboard = home_keyboard(False, False)

        self.assertEqual(len(keyboard.inline_keyboard), 4)
        self.assertEqual(keyboard.inline_keyboard[1][0].callback_data, "panel:account")
        self.assertEqual(keyboard.inline_keyboard[2][0].text, "🏆 Турниры")
        self.assertEqual(
            keyboard.inline_keyboard[2][0].url,
            "https://games.opinia.ru/games/tournaments",
        )

    def test_website_login_uses_configured_local_site_without_telegram_web(self) -> None:
        for registered in (True, False):
            keyboard = home_keyboard(registered, False, site_url="http://127.0.0.1:3003/")
            button = next(item for row in keyboard.inline_keyboard for item in row if item.text == "🌐 Войти через сайт")
            self.assertEqual(button.url, "http://127.0.0.1:3003/telegram/connect?from=bot")
            self.assertIsNone(button.callback_data)

    def test_account_and_onboarding_website_buttons_stay_on_local_site(self) -> None:
        url = "http://127.0.0.1:3003"
        for keyboard in (account_keyboard(False, False, False, site_url=url), onboarding_keyboard(url)):
            button = next(item for row in keyboard.inline_keyboard for item in row if item.text == "🌐 Войти через сайт")
            self.assertEqual(button.url, url + "/telegram/connect?from=bot")

    def test_existing_account_fdp_auto_login_button_is_preserved(self) -> None:
        profile_url = "https://games.example/telegram/access?ticket=owned-one-time-ticket"
        keyboard = account_keyboard(True, False, profile_url=profile_url)
        button = next(item for row in keyboard.inline_keyboard for item in row if item.text == "🔗 Аккаунт FDP")
        self.assertEqual(button.url, profile_url)


if __name__ == "__main__":
    unittest.main()
