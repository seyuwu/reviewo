import importlib.util
import os
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch


def load_script(name):
    path = Path(__file__).resolve().parents[1] / "scripts" / f"{name}.py"
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


launcher = load_script("local_test")


class LocalLauncherTests(unittest.IsolatedAsyncioTestCase):
    def test_environment_drops_production_credentials_and_pins_local_services(self):
        config = {"JWT_SECRET": "local-jwt", "TELEGRAM_BOT_API_SECRET": "local-secret", "DOTA_BOT_ENCRYPTION_KEY": "local-key"}
        with patch.dict(os.environ, {
            "DOTA_BOT_TOKEN": "prod-token", "DATABASE_URL": "postgresql://prod/production",
            "REDIS_URL": "redis://prod/0", "DISCORD_BOT_TOKEN": "prod-discord", "WAITLIST_BOT_TOKEN": "prod-waitlist",
        }):
            env = launcher.environment(config)
        self.assertEqual(env["DOTA_BOT_TOKEN"], "")
        self.assertEqual(env["DISCORD_BOT_TOKEN"], "")
        self.assertEqual(env["WAITLIST_BOT_TOKEN"], "")
        self.assertEqual(env["API_BIND_HOST"], "127.0.0.1")
        self.assertIn("@127.0.0.1:32208/fdp_local_bot", env["DATABASE_URL"])
        self.assertEqual(env["DOTA_BOT_API_BASE_URL"], "http://127.0.0.1:32207")
        self.assertEqual(env["DOTA_BOT_SITE_URL"], "http://127.0.0.1:3003")
        self.assertTrue(env["DOTA_BOT_DATABASE_PATH"].endswith(".local-test" + os.sep + "bot.sqlite3"))

    async def test_production_token_is_rejected_before_polling_or_webhook_changes(self):
        bot = SimpleNamespace(get_me=AsyncMock(return_value=SimpleNamespace(username="FDPdotabot")), session=SimpleNamespace(close=AsyncMock()))
        with patch("aiogram.Bot", return_value=bot):
            with self.assertRaises(ValueError):
                await launcher.verify_test_token("opaque-test-token")
        bot.session.close.assert_awaited_once()

    async def test_separate_test_token_is_accepted(self):
        bot = SimpleNamespace(get_me=AsyncMock(return_value=SimpleNamespace(username="fdp_test_bot")), session=SimpleNamespace(close=AsyncMock()))
        with patch("aiogram.Bot", return_value=bot):
            self.assertEqual(await launcher.verify_test_token("opaque-test-token"), "fdp_test_bot")
        bot.session.close.assert_awaited_once()
