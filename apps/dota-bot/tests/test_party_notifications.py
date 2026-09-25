import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from bot.handlers.party import send_party_notification


class PartyNotificationTests(unittest.IsolatedAsyncioTestCase):
    async def test_member_joined_refreshes_panel_then_sends_ten_second_message(self) -> None:
        events = []
        bot = SimpleNamespace(send_message=AsyncMock(return_value=SimpleNamespace(
            chat=SimpleNamespace(id=123), message_id=456
        )))
        bot.send_message.side_effect = lambda *args, **kwargs: events.append("send") or SimpleNamespace(
            chat=SimpleNamespace(id=123), message_id=456
        )
        storage = SimpleNamespace(
            add_temporary_message=lambda *args: events.append(("ttl", args[-1]))
        )
        settings = SimpleNamespace(site_url="https://dota.opinia.ru")
        row = {
            "telegramUserId": "123",
            "payload": {
                "type": "member_joined",
                "invite": {"inviteeDisplayName": "Игрок", "partyName": "Тест"},
            },
        }

        async def refresh_panel(*args, **kwargs):
            events.append("refresh")

        with patch("bot.handlers.party.edit_panel", new=AsyncMock(side_effect=refresh_panel)):
            delivered = await send_party_notification(bot, settings, storage, object(), row)

        self.assertTrue(delivered)
        self.assertEqual(events, ["refresh", "send", ("ttl", 10)])
        bot.send_message.assert_awaited_once()

    async def test_member_joined_message_is_sent_even_if_panel_refresh_fails(self) -> None:
        bot = SimpleNamespace(send_message=AsyncMock(return_value=SimpleNamespace(
            chat=SimpleNamespace(id=123), message_id=456
        )))
        storage = SimpleNamespace(add_temporary_message=lambda *args: None)
        settings = SimpleNamespace(site_url="https://dota.opinia.ru")
        row = {
            "telegramUserId": "123",
            "payload": {
                "type": "member_joined",
                "invite": {"inviteeDisplayName": "Игрок", "partyName": "Тест"},
            },
        }

        with patch("bot.handlers.party.edit_panel", new=AsyncMock(side_effect=RuntimeError("edit failed"))):
            delivered = await send_party_notification(bot, settings, storage, object(), row)

        self.assertTrue(delivered)
        bot.send_message.assert_awaited_once()

    async def test_delivery_fails_if_roster_message_cannot_be_sent(self) -> None:
        bot = SimpleNamespace(send_message=AsyncMock(side_effect=RuntimeError("send failed")))
        storage = SimpleNamespace(add_temporary_message=lambda *args: None)
        settings = SimpleNamespace(site_url="https://dota.opinia.ru")
        row = {
            "telegramUserId": "123",
            "payload": {
                "type": "member_left",
                "memberDisplayName": "Игрок",
                "partyName": "Тест",
            },
        }

        with patch("bot.handlers.party.edit_panel", new=AsyncMock()):
            delivered = await send_party_notification(bot, settings, storage, object(), row)

        self.assertFalse(delivered)


if __name__ == "__main__":
    unittest.main()
