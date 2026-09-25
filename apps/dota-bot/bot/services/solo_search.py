from urllib.parse import quote


class PartyOwnerMustResolveMembers(Exception):
    """Raised when the captain cannot leave a party that still has other players."""


async def start_solo_search(api, telegram_user_id: int) -> None:
    memberships = await api.user(telegram_user_id, "GET", "/social/parties/me")
    party = memberships.get("party") or ((memberships.get("parties") or [None])[-1])

    if party:
        member_count = int(party.get("memberCount") or len(party.get("members") or []))
        if party.get("isOwner") and member_count > 1:
            raise PartyOwnerMustResolveMembers

        slug = quote(str(party["slug"]), safe="")
        await api.user(
            telegram_user_id,
            "DELETE",
            f"/social/parties/{slug}/members/me",
        )

    await api.user(
        telegram_user_id,
        "POST",
        "/dota/profiles/lfg/looking",
        {"looking": True},
    )
