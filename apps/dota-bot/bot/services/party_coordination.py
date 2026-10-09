import secrets
from datetime import UTC, datetime, timedelta
from urllib.parse import quote

from ..api.client import ApiError


def own_member(coordination):
    return next((member for member in coordination.get("members", []) if member.get("isSelf")), None)


def coordination_context(storage, user_id, coordination):
    member = own_member(coordination)
    if not member or not member.get("membershipId"):
        return None
    key = "party_coordination:" + coordination["id"]
    current = storage.get_choice(user_id, key, 0)
    token = current.get("token") if isinstance(current, dict) and current.get("membershipId") == member["membershipId"] else None
    token = token or secrets.token_hex(10)
    context = {
        "token": token, "partyId": coordination["id"], "partySlug": coordination["slug"],
        "membershipId": member["membershipId"],
    }
    storage.set_choices(user_id, key, [context])
    storage.set_choices(user_id, "party_coordination_token:" + token, [context])
    return context


async def read_coordination(api, user_id, slug):
    value = await api.user(user_id, "GET", f"/social/parties/{quote(slug, safe='')}/coordination")
    if not isinstance(value, dict) or not value.get("id") or own_member(value) is None:
        raise ApiError("Не удалось проверить состав пати", 503)
    return value


async def enrich_party(api, storage, user_id, party):
    try:
        coordination = await read_coordination(api, user_id, party["slug"])
    except ApiError:
        return party
    if coordination["id"] != party.get("id"):
        return party
    context = coordination_context(storage, user_id, coordination)
    details = {member["userId"]: member for member in coordination["members"]}
    result = {**party, "coordinationAvailable": True, "coordinationToken": context["token"] if context else None}
    result["members"] = [{**member, **details.get(member["userId"], {})} for member in party["members"]]
    return result


def notice_deadline(coordination):
    deadline = datetime.now(UTC) + timedelta(hours=24)
    if coordination.get("expiresAt"):
        deadline = min(deadline, datetime.fromisoformat(coordination["expiresAt"].replace("Z", "+00:00")))
    return deadline
