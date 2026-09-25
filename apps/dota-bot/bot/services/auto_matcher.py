import asyncio
import logging
from urllib.parse import urlencode

from ..api.client import ApiError, OpiniaApi
from ..storage.database import BotStorage

logger = logging.getLogger(__name__)


async def auto_match_loop(api: OpiniaApi, storage: BotStorage) -> None:
    """Send at most one pending invite per recruiting party, then wait for a response."""
    while True:
        try:
            for telegram_user_id in storage.session_user_ids():
                try:
                    await _match_user(api, storage, telegram_user_id)
                except asyncio.CancelledError:
                    raise
                except Exception:
                    logger.exception(
                        "Automatic party match failed for Telegram user %s", telegram_user_id
                    )
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Automatic party matching failed")
        await asyncio.sleep(15)


async def _match_user(api: OpiniaApi, storage: BotStorage, telegram_user_id: int) -> None:
    search = storage.get_choice(telegram_user_id, "auto_search", 0)
    if not search or search.get("mode") != "recruit":
        return

    try:
        profile = await api.user(telegram_user_id, "GET", "/dota/profiles/me")
        if not profile.get("looking") or profile.get("matchMode") == "manual":
            return

        my_parties = await api.user(telegram_user_id, "GET", "/social/parties/me")
        party = my_parties.get("party") or ((my_parties.get("parties") or [None])[-1])
        party_slug = search.get("partySlug")
        if not party or not party_slug or party.get("slug") != party_slug:
            return

        outgoing = my_parties.get("outgoingInvites", [])
        party_invites = [
            item
            for item in outgoing
            if item.get("partySlug") == party_slug and item.get("inviteKind") == "INVITE"
        ]
        for invite in party_invites:
            target_slug = invite.get("inviteeDotaSlug")
            if target_slug:
                storage.exclude_auto_match_target(telegram_user_id, target_slug)
        if any(item.get("status") == "PENDING" for item in party_invites):
            return

        roles = search.get("roles") or []
        params = {"roles": ",".join(roles)} if roles else {}
        if profile.get("server"):
            params["server"] = profile["server"]
        query = urlencode(params)
        path = "/dota/profiles/lfg" + (f"?{query}" if query else "")
        candidates_response = await api.user(telegram_user_id, "GET", path)
        excluded = storage.auto_match_exclusions(telegram_user_id)
        candidates = [
            candidate
            for candidate in candidates_response.get("results", [])
            if candidate.get("slug")
            and candidate.get("ownerUserId") != profile.get("ownerUserId")
            and not candidate.get("partySlug")
            and candidate.get("slug") not in excluded
        ]
        if not candidates:
            return

        candidate = candidates[0]
        role = next((item for item in candidate.get("roles", []) if item in roles), None)
        body = {"targetSlug": candidate["slug"], "partySlug": party_slug}
        if role:
            body["positionRole"] = role
        await api.user(telegram_user_id, "POST", "/social/parties/stack", body)
        storage.exclude_auto_match_target(telegram_user_id, candidate["slug"])
        logger.info(
            "Sent automatic party invite",
            extra={"party_slug": party_slug, "target_slug": candidate["slug"]},
        )
    except ApiError as error:
        if error.status in {401, 403, 404, 409, 422}:
            logger.info("Skipped automatic party match for Telegram user %s: %s", telegram_user_id, error)
            return
        logger.warning("Automatic party match API request failed: %s", error)


def remember_declined_target(storage: BotStorage, telegram_user_id: int, payload: dict) -> None:
    invite = payload.get("invite") or {}
    target_slug = invite.get("inviteeDotaSlug")
    if target_slug:
        storage.exclude_auto_match_target(telegram_user_id, str(target_slug))


__all__ = ["auto_match_loop", "remember_declined_target"]
