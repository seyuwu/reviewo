import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from bot.services.auto_matcher import _match_user


class FakeStorage:
    def __init__(self) -> None:
        self.choices = {"auto_search": {"mode": "looking"}}
        self.panel = type("Panel", (), {"screen": "looking"})()

    def get_choice(self, telegram_user_id: int, kind: str, index: int):
        return self.choices.get(kind)

    def set_choices(self, telegram_user_id: int, kind: str, items: list[dict]) -> None:
        self.choices[kind] = items[0] if items else None

    def clear_auto_match_exclusions(self, telegram_user_id: int) -> None:
        pass

    def get_panel(self, telegram_user_id: int):
        return self.panel


class FakeApi:
    def __init__(self, party_response: dict) -> None:
        self.party_response = party_response
        self.calls: list[str] = []
        self.storage: FakeStorage | None = None
        self.clear_search_during_profile_request = False

    async def user(self, telegram_user_id: int, method: str, path: str, body=None):
        self.calls.append(path)
        if path == "/dota/profiles/me":
            if self.clear_search_during_profile_request and self.storage:
                self.storage.set_choices(telegram_user_id, "auto_search", [])
            return {"looking": False}
        if path == "/social/parties/me":
            return self.party_response
        raise AssertionError(f"Unexpected API request: {method} {path}")


class AutoMatchPanelTests(unittest.IsolatedAsyncioTestCase):
    async def test_stale_solo_search_keeps_new_party_panel_open(self) -> None:
        api = FakeApi({"party": {"slug": "new-party"}, "parties": []})
        storage = FakeStorage()
        bot = object()
        settings = object()

        with patch("bot.services.auto_matcher.edit_panel", new_callable=AsyncMock) as edit_panel:
            await _match_user(bot, api, settings, storage, 42)

        edit_panel.assert_awaited_once_with(bot, storage, api, settings, 42, "party")
        self.assertEqual(api.calls, ["/dota/profiles/me", "/social/parties/me"])

    async def test_stopped_search_without_a_party_returns_to_home(self) -> None:
        api = FakeApi({"party": None, "parties": []})
        storage = FakeStorage()
        bot = object()
        settings = object()

        with patch("bot.services.auto_matcher.edit_panel", new_callable=AsyncMock) as edit_panel:
            await _match_user(bot, api, settings, storage, 42)

        edit_panel.assert_awaited_once_with(bot, storage, api, settings, 42, "home")

    async def test_in_flight_search_does_not_redraw_after_party_creation_starts(self) -> None:
        api = FakeApi({"party": {"slug": "new-party"}, "parties": []})
        storage = FakeStorage()
        api.storage = storage
        api.clear_search_during_profile_request = True

        with patch("bot.services.auto_matcher.edit_panel", new_callable=AsyncMock) as edit_panel:
            await _match_user(object(), api, object(), storage, 42)

        edit_panel.assert_not_awaited()
        self.assertEqual(api.calls, ["/dota/profiles/me"])


if __name__ == "__main__":
    unittest.main()
