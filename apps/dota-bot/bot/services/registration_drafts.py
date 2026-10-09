"""Durable signup progress, separate from account login and profile editing."""

from ..storage.database import BotStorage

DRAFT_KIND = "registration_draft"
ROLES = frozenset({"1", "2", "3", "4", "5"})


def registration_draft(storage: BotStorage, user_id: int) -> dict | None:
    value = storage.get_choice(user_id, DRAFT_KIND, 0)
    if not isinstance(value, dict) or value.get("step") not in {"mmr", "roles", "link"}:
        return None
    name = value.get("display_name")
    if not isinstance(name, str) or not name.strip() or len(name) > 80:
        return None
    return value


def save_registration_draft(storage: BotStorage, user_id: int, data: dict, step: str) -> None:
    if data.get("editing_profile"):
        return
    if step not in {"mmr", "roles", "link"}:
        raise ValueError("Invalid registration step")
    name = data.get("display_name")
    if not isinstance(name, str) or not name.strip():
        return
    draft = {
        "step": step,
        "display_name": name.strip()[:80],
        "roles": sorted({str(role) for role in data.get("roles", []) if str(role) in ROLES}),
    }
    mmr = data.get("mmr")
    if mmr is not None and str(mmr).isdigit() and 0 <= int(mmr) <= 18000:
        draft["mmr"] = str(mmr)
    for field in ("dota_account_id", "party_invite_code"):
        value = data.get(field)
        if isinstance(value, str) and value:
            draft[field] = value[:128]
    for field in ("required_role", "party_invite_role"):
        if data.get(field) in ROLES:
            draft[field] = data[field]
    pending = storage.get_choice(user_id, "pending_onboarding_action", 0)
    action = pending.get("action") if isinstance(pending, dict) else data.get("pending_action")
    if action in {"looking", "recruit"}:
        draft["pending_action"] = action
    storage.set_choices(user_id, DRAFT_KIND, [draft])


def clear_registration_draft(storage: BotStorage, user_id: int) -> None:
    storage.set_choices(user_id, DRAFT_KIND, [])
