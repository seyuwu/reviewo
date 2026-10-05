import asyncio
import logging
import time
from random import choice, shuffle
from urllib.parse import urlencode

from ..api.client import ApiError, OpiniaApi
from ..config import Settings
from ..storage.database import BotStorage
from .panel import edit_panel
from .party_notifications import deliver_join_hint
from .search_timeout_notices import queue_solo_timeout

logger = logging.getLogger(__name__)
ROLE_VALUES = {"1", "2", "3", "4", "5"}
SOLO_GROUP_MMR_SPREAD = 1500


def solo_search_roles(profile: dict) -> list[str]:
    if profile.get("searchAllRoles"):
        return sorted(ROLE_VALUES)
    return sorted({str(role) for role in (profile.get("roles") or [])} & ROLE_VALUES)


def _is_current_solo_search(storage, telegram_user_id: int, search: dict) -> bool:
    current = storage.get_choice(telegram_user_id, "auto_search", 0) or {}
    return (
        current.get("mode") == "looking"
        and current.get("startedAt") == search.get("startedAt")
    )


async def auto_match_loop(
    bot,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
    match_wakeup: asyncio.Event,
) -> None:
    """Automatically join compatible open parties for Telegram users searching solo."""
    while True:
        # Clear before scanning so signals raised during a scan trigger another pass
        # immediately instead of being lost when the scan finishes.
        match_wakeup.clear()
        try:
            await _form_solo_searcher_groups(bot, api, settings, storage)
            for telegram_user_id in storage.session_user_ids():
                try:
                    await _match_user(bot, api, settings, storage, telegram_user_id)
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
        try:
            await asyncio.wait_for(match_wakeup.wait(), timeout=5)
        except asyncio.TimeoutError:
            pass


async def _form_solo_searcher_groups(bot, api, settings, storage) -> None:
    """Atomically group compatible bot users already searching as solo players."""
    searching_users = [
        telegram_user_id
        for telegram_user_id in storage.session_user_ids()
        if (storage.get_choice(telegram_user_id, "auto_search", 0) or {}).get("mode")
        == "looking"
    ]
    if len(searching_users) < 2:
        return

    semaphore = asyncio.Semaphore(8)

    async def load_searcher(telegram_user_id: int) -> dict | None:
        async with semaphore:
            try:
                profile = await api.user(telegram_user_id, "GET", "/dota/profiles/me")
                if not profile.get("looking"):
                    return None

                memberships = await api.user(telegram_user_id, "GET", "/social/parties/me")
                if memberships.get("party") or memberships.get("parties"):
                    return None

                mmr = mmr_interval(profile.get("mmr"))
                roles = solo_search_roles(profile)
                owner_user_id = str(profile.get("ownerUserId") or "")
                if not mmr or not roles or not owner_user_id or not profile.get("slug"):
                    return None

                return {
                    "mmr": mmr,
                    "ownerUserId": owner_user_id,
                    "profile": profile,
                    "roles": roles,
                    "server": str(profile.get("server") or "").strip(),
                    "telegramUserId": telegram_user_id,
                }
            except asyncio.CancelledError:
                raise
            except ApiError as error:
                logger.info(
                    "Skipped solo group candidate %s: %s", telegram_user_id, error
                )
                return None

    candidates = [
        candidate
        for candidate in await asyncio.gather(*(load_searcher(user_id) for user_id in searching_users))
        if candidate is not None
    ]
    # One Opinia account can only be linked to one Telegram identity, but keep this
    # guard in case stale local sessions remain after a link change.
    candidates = list({candidate["ownerUserId"]: candidate for candidate in candidates}.values())

    while len(candidates) >= 2:
        group_and_roles = _build_random_solo_group(candidates)
        if group_and_roles is None:
            return
        group, assigned_roles = group_and_roles
        leader = choice(group)
        payload = {
            "leaderUserId": leader["ownerUserId"],
            "members": [
                {
                    "positionRole": assigned_roles[candidate["ownerUserId"]],
                    "userId": candidate["ownerUserId"],
                }
                for candidate in group
            ],
        }

        try:
            party = await api.user(
                leader["telegramUserId"],
                "POST",
                "/social/parties/auto-match/solo-group",
                payload,
                bot_secret=True,
            )
        except asyncio.CancelledError:
            raise
        except ApiError as error:
            logger.info("Could not form a solo search group: %s", error)
            return

        party_slug = str(party.get("slug") or "")
        if not party_slug:
            logger.error("Solo group endpoint returned a party without a slug")
            return

        occupied_roles = set(assigned_roles.values())
        open_roles = sorted(ROLE_VALUES - occupied_roles)
        now = time.time()
        for candidate in group:
            telegram_user_id = candidate["telegramUserId"]
            storage.record_party_joined(telegram_user_id, completes_search=True)
            storage.clear_auto_match_exclusions(telegram_user_id)
            if candidate["ownerUserId"] == leader["ownerUserId"] and open_roles:
                storage.set_choices(
                    telegram_user_id,
                    "auto_search",
                    [{"mode": "recruit", "partySlug": party_slug, "roles": open_roles, "startedAt": now}],
                )
            else:
                storage.set_choices(telegram_user_id, "auto_search", [])

        async def refresh_party_panel(candidate: dict) -> None:
            try:
                await edit_panel(
                    bot,
                    storage,
                    api,
                    settings,
                    candidate["telegramUserId"],
                    "party",
                )
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception(
                    "Could not refresh party panel after solo group formation for user %s",
                    candidate["telegramUserId"],
                )

        await asyncio.gather(*(refresh_party_panel(candidate) for candidate in group))
        logger.info(
            "Formed an automatic solo-search party",
            extra={
                "leader_telegram_user_id": leader["telegramUserId"],
                "member_count": len(group),
                "party_slug": party_slug,
            },
        )
        grouped_ids = {candidate["ownerUserId"] for candidate in group}
        candidates = [candidate for candidate in candidates if candidate["ownerUserId"] not in grouped_ids]


def _build_random_solo_group(candidates: list[dict]) -> tuple[list[dict], dict[str, str]] | None:
    shuffled = candidates.copy()
    shuffle(shuffled)
    possible_groups: list[tuple[list[dict], dict[str, str]]] = []

    for anchor in shuffled:
        group = [anchor]
        remaining = [candidate for candidate in shuffled if candidate is not anchor]
        shuffle(remaining)
        remaining.sort(key=lambda candidate: len(candidate["roles"]))

        for candidate in remaining:
            if len(group) >= 5 or not _solo_group_mmr_compatible(group, candidate):
                continue
            if not _solo_group_servers_compatible(group, candidate):
                continue
            tentative = [*group, candidate]
            assignments = _assign_random_roles(tentative)
            if assignments is not None:
                group = tentative

        assignments = _assign_random_roles(group)
        if len(group) > 1 and assignments is not None:
            possible_groups.append((group, assignments))

    if not possible_groups:
        return None
    largest_group_size = max(len(group) for group, _ in possible_groups)
    return choice([item for item in possible_groups if len(item[0]) == largest_group_size])


def _solo_group_mmr_compatible(group: list[dict], candidate: dict) -> bool:
    low = min([player["mmr"][0] for player in group] + [candidate["mmr"][0]])
    high = max([player["mmr"][1] for player in group] + [candidate["mmr"][1]])
    return high - low <= SOLO_GROUP_MMR_SPREAD


def _solo_group_servers_compatible(group: list[dict], candidate: dict) -> bool:
    servers = {player["server"] for player in [*group, candidate] if player["server"]}
    return len(servers) <= 1


def _assign_random_roles(players: list[dict]) -> dict[str, str] | None:
    ordered_players = sorted(players, key=lambda player: len(player["roles"]))
    assignment: dict[str, str] = {}
    occupied: set[str] = set()

    def assign(index: int) -> bool:
        if index == len(ordered_players):
            return True
        player = ordered_players[index]
        available_roles = [role for role in player["roles"] if role not in occupied]
        shuffle(available_roles)
        for role in available_roles:
            occupied.add(role)
            assignment[player["ownerUserId"]] = role
            if assign(index + 1):
                return True
            occupied.remove(role)
            assignment.pop(player["ownerUserId"], None)
        return False

    return assignment if assign(0) else None


async def _match_user(
    bot,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
    telegram_user_id: int,
) -> None:
    search = storage.get_choice(telegram_user_id, "auto_search", 0)
    if not search or search.get("mode") != "looking":
        return

    try:
        profile = await api.user(telegram_user_id, "GET", "/dota/profiles/me")
        # The user may have started creating a party while this background pass
        # was waiting on the API. Do not let this stale pass redraw their panel.
        if not _is_current_solo_search(storage, telegram_user_id, search):
            return
        if not profile.get("looking"):
            my_parties = await api.user(telegram_user_id, "GET", "/social/parties/me")
            if not _is_current_solo_search(storage, telegram_user_id, search):
                return
            queue_solo_timeout(storage, telegram_user_id, search, profile, my_parties)
            storage.set_choices(telegram_user_id, "auto_search", [])
            storage.clear_auto_match_exclusions(telegram_user_id)
            panel = storage.get_panel(telegram_user_id)
            if panel and panel.screen != "looking":
                return
            party = my_parties.get("party") or ((my_parties.get("parties") or [None])[-1])
            await edit_panel(
                bot,
                storage,
                api,
                settings,
                telegram_user_id,
                "party" if party else "home",
            )
            return

        my_parties = await api.user(telegram_user_id, "GET", "/social/parties/me")
        if not _is_current_solo_search(storage, telegram_user_id, search):
            return
        if my_parties.get("party") or my_parties.get("parties"):
            panel = storage.get_panel(telegram_user_id)
            if panel and panel.screen == "loading":
                return
            storage.set_choices(telegram_user_id, "auto_search", [])
            await edit_panel(bot, storage, api, settings, telegram_user_id, "party")
            return

        player_mmr = mmr_interval(profile.get("mmr"))
        player_roles = solo_search_roles(profile)
        if player_mmr is None or not player_roles:
            return

        params = {"roles": ",".join(player_roles)}
        if profile.get("server"):
            params["server"] = profile["server"]
        candidates_response = await api.user(
            telegram_user_id,
            "GET",
            f"/dota/profiles/lfg?{urlencode(params)}",
        )
        if not _is_current_solo_search(storage, telegram_user_id, search):
            return
        excluded = storage.auto_match_exclusions(telegram_user_id)
        candidates = []
        for candidate in candidates_response.get("results", []):
            if (
                not candidate.get("partySlug")
                or candidate.get("partyKind") != "PARTY"
                or candidate.get("joinMode") != "OPEN"
                or candidate.get("ownerUserId") == profile.get("ownerUserId")
                or candidate.get("slug") in excluded
            ):
                continue

            roles = sorted({str(role) for role in candidate.get("recruitedRoles", [])} & set(player_roles))
            band = mmr_band(candidate.get("recruitMmrMin"), candidate.get("recruitMmrMax"))
            if not roles or band is None or not mmr_ranges_overlap(player_mmr, band):
                continue
            candidates.append((mmr_distance(player_mmr, band), -len(roles), candidate, roles))

        candidates.sort(key=lambda item: (item[0], item[1]))
        for _, _, candidate, roles in candidates:
            role_order = roles.copy()
            shuffle(role_order)
            result = None
            for role in role_order:
                try:
                    result = await api.user(
                        telegram_user_id,
                        "POST",
                        "/social/parties/stack",
                        {
                            "manualJoin": False,
                            "positionRole": role,
                            "targetSlug": candidate["slug"],
                        },
                    )
                    break
                except ApiError as error:
                    # A role can be claimed between listing the party and joining it.
                    # Retry another compatible free position before excluding the party.
                    if error.status == 409 and "role" in str(error).lower():
                        continue
                    if error.status in {403, 404, 409, 422}:
                        storage.exclude_auto_match_target(telegram_user_id, candidate["slug"])
                        break
                    raise

            if result is None:
                storage.exclude_auto_match_target(telegram_user_id, candidate["slug"])
                continue

            invite = result.get("invite") or {}
            party = result.get("party") or {}
            if invite.get("status") != "ACCEPTED" or not party.get("slug"):
                storage.exclude_auto_match_target(telegram_user_id, candidate["slug"])
                continue

            storage.record_party_joined(telegram_user_id, completes_search=True)
            storage.set_choices(telegram_user_id, "auto_search", [])
            storage.clear_auto_match_exclusions(telegram_user_id)
            await edit_panel(bot, storage, api, settings, telegram_user_id, "party")
            try:
                await deliver_join_hint(
                    bot, api, storage, telegram_user_id, settings.site_url, party["slug"]
                )
            except Exception:
                logger.warning(
                    "Could not send automatic party join hint to Telegram user %s",
                    telegram_user_id,
                    exc_info=True,
                )
            logger.info(
                "Automatically joined Dota party",
                extra={
                    "party_slug": party["slug"],
                    "position_role": invite.get("positionRole"),
                    "telegram_user_id": telegram_user_id,
                },
            )
            return
    except ApiError as error:
        if error.status in {401, 403, 404, 409, 422}:
            logger.info("Skipped automatic party match for Telegram user %s: %s", telegram_user_id, error)
            return
        logger.warning("Automatic party match API request failed: %s", error)


def mmr_interval(value: object) -> tuple[float, float] | None:
    if not isinstance(value, (str, int, float)):
        return None
    parts = str(value).strip().replace(" ", "").split("-", maxsplit=1)
    try:
        numbers = [float(part) for part in parts]
    except ValueError:
        return None
    if len(numbers) == 1:
        low = high = numbers[0]
    else:
        low, high = sorted(numbers)
    if low < 0 or high > 18000:
        return None
    return low, high


def mmr_band(minimum: object, maximum: object) -> tuple[float, float] | None:
    try:
        low, high = float(minimum), float(maximum)
    except (TypeError, ValueError):
        return None
    return (low, high) if 0 <= low <= high <= 18000 else None


def mmr_ranges_overlap(left: tuple[float, float], right: tuple[float, float]) -> bool:
    return left[0] <= right[1] and right[0] <= left[1]


def mmr_distance(left: tuple[float, float], right: tuple[float, float]) -> float:
    if mmr_ranges_overlap(left, right):
        return 0
    if left[1] < right[0]:
        return right[0] - left[1]
    return left[0] - right[1]


def remember_declined_target(storage: BotStorage, telegram_user_id: int, payload: dict) -> None:
    invite = payload.get("invite") or {}
    target_slug = invite.get("inviteeDotaSlug")
    if target_slug:
        storage.exclude_auto_match_target(telegram_user_id, str(target_slug))


__all__ = [
    "auto_match_loop",
    "mmr_band",
    "mmr_distance",
    "mmr_interval",
    "mmr_ranges_overlap",
    "remember_declined_target",
]
