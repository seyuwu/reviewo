import asyncio
import logging
from random import shuffle
from urllib.parse import urlencode

from ..api.client import ApiError, OpiniaApi
from ..config import Settings
from ..storage.database import BotStorage
from .panel import edit_panel
from .party_notifications import deliver_join_hint

logger = logging.getLogger(__name__)
ROLE_VALUES = {"1", "2", "3", "4", "5"}


async def auto_match_loop(bot, api: OpiniaApi, settings: Settings, storage: BotStorage) -> None:
    """Automatically join compatible open parties for Telegram users searching solo."""
    while True:
        try:
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
        await asyncio.sleep(15)


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
        if not profile.get("looking"):
            storage.set_choices(telegram_user_id, "auto_search", [])
            storage.clear_auto_match_exclusions(telegram_user_id)
            await edit_panel(bot, storage, api, settings, telegram_user_id, "home")
            return

        my_parties = await api.user(telegram_user_id, "GET", "/social/parties/me")
        if my_parties.get("party") or my_parties.get("parties"):
            storage.set_choices(telegram_user_id, "auto_search", [])
            await edit_panel(bot, storage, api, settings, telegram_user_id, "party")
            return

        player_mmr = mmr_interval(profile.get("mmr"))
        player_roles = sorted({str(role) for role in (profile.get("roles") or [])} & ROLE_VALUES)
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
                    if error.status in {404, 409, 422}:
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

            storage.set_choices(telegram_user_id, "auto_search", [])
            storage.clear_auto_match_exclusions(telegram_user_id)
            await edit_panel(bot, storage, api, settings, telegram_user_id, "party")
            try:
                await deliver_join_hint(
                    bot, storage, telegram_user_id, settings.site_url, party["slug"]
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
