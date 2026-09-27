from urllib.parse import quote


class PartyOwnerMustResolveMembers(Exception):
    """Raised when the captain cannot leave a party that still has other players."""


class PartyChangedDuringConfirmation(Exception):
    """Raised when the user's current party changed after the confirmation prompt."""


async def start_solo_search(
    api,
    telegram_user_id: int,
    *,
    confirmed_party: dict | None = None,
) -> None:
    memberships = await api.user(telegram_user_id, "GET", "/social/parties/me")
    party = memberships.get("party") or ((memberships.get("parties") or [None])[-1])

    if party:
        slug = str(party["slug"])
        is_owner = bool(party.get("isOwner"))
        if confirmed_party is not None and (
            str(confirmed_party.get("partySlug") or "") != slug
            or bool(confirmed_party.get("isOwner")) != is_owner
        ):
            raise PartyChangedDuringConfirmation

        member_count = int(party.get("memberCount") or len(party.get("members") or []))
        if party.get("isOwner") and member_count > 1:
            if confirmed_party is None:
                raise PartyOwnerMustResolveMembers

        encoded_slug = quote(slug, safe="")
        if is_owner and confirmed_party is not None:
            await api.user(
                telegram_user_id,
                "DELETE",
                f"/social/parties/{encoded_slug}",
            )
        else:
            await api.user(
                telegram_user_id,
                "DELETE",
                f"/social/parties/{encoded_slug}/members/me",
            )

    await api.user(
        telegram_user_id,
        "POST",
        "/dota/profiles/lfg/looking",
        {"looking": True},
    )
