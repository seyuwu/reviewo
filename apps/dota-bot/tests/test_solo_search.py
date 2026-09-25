import asyncio
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from bot.services.solo_search import PartyOwnerMustResolveMembers, start_solo_search


class FakeApi:
    def __init__(self, party_response: dict) -> None:
        self.party_response = party_response
        self.calls: list[tuple[str, str, dict | None]] = []

    async def user(self, user_id: int, method: str, path: str, body: dict | None = None) -> dict:
        self.calls.append((method, path, body))
        if method == "GET" and path == "/social/parties/me":
            return self.party_response
        return {}


def make_party(*, owner: bool, member_count: int) -> dict:
    return {
        "isOwner": owner,
        "memberCount": member_count,
        "slug": "party-current",
    }


class SoloSearchSwitchTests(unittest.IsolatedAsyncioTestCase):
    async def test_single_member_party_is_closed_before_solo_search_starts(self) -> None:
        api = FakeApi({"party": make_party(owner=True, member_count=1), "parties": []})

        await start_solo_search(api, 42)

        self.assertEqual(
            api.calls,
            [
                ("GET", "/social/parties/me", None),
                ("DELETE", "/social/parties/party-current/members/me", None),
                ("POST", "/dota/profiles/lfg/looking", {"looking": True}),
            ],
        )

    async def test_party_member_leaves_before_solo_search_starts(self) -> None:
        api = FakeApi({"parties": [make_party(owner=False, member_count=4)]})

        await start_solo_search(api, 42)

        self.assertEqual(api.calls[-1], ("POST", "/dota/profiles/lfg/looking", {"looking": True}))
        self.assertEqual(api.calls[1][0:2], ("DELETE", "/social/parties/party-current/members/me"))

    async def test_party_owner_with_other_members_is_not_removed_or_queued(self) -> None:
        api = FakeApi({"party": make_party(owner=True, member_count=2), "parties": []})

        with self.assertRaises(PartyOwnerMustResolveMembers):
            await start_solo_search(api, 42)

        self.assertEqual(api.calls, [("GET", "/social/parties/me", None)])


if __name__ == "__main__":
    unittest.main()
