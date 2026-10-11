import asyncio
import logging
from uuid import UUID

from ..api.client import ApiError

logger = logging.getLogger(__name__)
REGISTRY = "party_notice_message:"
ROOM_PREFIXES = ("party_room_hint:", "party_room_ready_link:", "party_room_ping_link:")


def valid_uuid(value):
    try:
        parsed = UUID(str(value))
        return str(parsed) if parsed.version == 4 else None
    except (ValueError, TypeError, AttributeError):
        return None


def collect_party_notice_sources(storage):
    result = []
    for source in storage.party_notice_sources():
        user_id, kind, item = source["userId"], source["kind"], source["item"]
        party_id = valid_uuid(item.get("partyId"))
        if not party_id:
            prefix = next((prefix for prefix in ROOM_PREFIXES if kind.startswith(prefix)), None)
            party_id = valid_uuid(kind[len(prefix):]) if prefix else None
        if not party_id or not 0 < user_id < 10**16:
            continue
        context = storage.get_choice(user_id, "party_coordination:" + party_id, 0) or {}
        membership_id = valid_uuid(item.get("membershipId") if kind.startswith(REGISTRY)
                                   else item.get("membershipId") or context.get("membershipId"))
        chat_id = item.get("chatId") or user_id
        if chat_id != user_id:
            continue
        message_ids = [item[field] for field in ("messageId", "reminderMessageId")
                       if isinstance(item.get(field), int) and item[field] > 0]
        result.append({**source, "partyId": party_id, "membershipId": membership_id,
                       "chatId": chat_id, "messageIds": message_ids})
    return result


def context_key(source):
    return source["userId"], source["partyId"], source["membershipId"]


def expire_sources(storage, sources):
    for source in sources:
        for message_id in source["messageIds"]:
            storage.add_temporary_message(source["userId"], source["chatId"], message_id, 0)
        current = storage.get_choice(source["userId"], source["kind"], 0)
        if current != source["item"]:
            continue
        storage.set_choices(source["userId"], source["kind"], [])
        if source["kind"].startswith("party_ready_notice:"):
            from .party_ready import _links
            _links.pop((source["userId"], source["kind"].split(":", 1)[1]), None)


def expire_party_notices(storage, party_id, user_id=None, membership_id=None):
    sources = [source for source in collect_party_notice_sources(storage)
               if source["partyId"] == party_id and (user_id is None or source["userId"] == user_id)
               and (membership_id is None or source["membershipId"] == membership_id
                    or user_id is not None and source["membershipId"] is None)]
    expire_sources(storage, sources)


def expire_other_party_notices(storage, user_id, active_party_ids):
    expire_sources(storage, [source for source in collect_party_notice_sources(storage)
                            if source["userId"] == user_id and source["partyId"] not in active_party_ids])


async def reconcile_party_notice_memberships(bot, api, storage):
    sources = collect_party_notice_sources(storage)
    contexts = {context_key(source): {
        "userId": str(source["userId"]), "partyId": source["partyId"],
        **({"membershipId": source["membershipId"]} if source["membershipId"] else {})
    } for source in sources}
    values = list(contexts.values())
    inactive = set()
    for offset in range(0, len(values), 500):
        result = await api.rooms_request("POST", "/notice-memberships", {
            "botId": str(bot.id), "contexts": values[offset:offset + 500]})
        if not isinstance(result, list):
            raise ApiError("Invalid party notice membership response", 503)
        for item in result:
            key = (int(item["userId"]), item["partyId"], item.get("membershipId"))
            if key in contexts and item.get("active") is False:
                inactive.add(key)
    expire_sources(storage, [source for source in sources if context_key(source) in inactive])
    pool = getattr(api, "party_rooms", None)
    if pool:
        for user_id, party_id, membership_id in inactive:
            hint = pool.hint_queue.get((user_id, party_id))
            if hint and membership_id and any(str(member.get("telegramId")) == str(user_id)
                    and member.get("membershipId") == membership_id for member in hint.get("data", {}).get("roster", [])):
                pool.hint_queue.pop((user_id, party_id), None)


async def party_notice_cleanup_worker(bot, api, storage):
    while True:
        try:
            await reconcile_party_notice_memberships(bot, api, storage)
        except asyncio.CancelledError:
            raise
        except ApiError:
            # An unavailable server must not be interpreted as a player leaving.
            logger.warning("Could not check party notice memberships; will retry")
        except Exception:
            logger.exception("Party notice cleanup failed")
        await asyncio.sleep(5)
