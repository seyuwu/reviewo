from aiogram.client.session.middlewares.base import BaseRequestMiddleware
from aiogram.types import Message
import time


def member_present(member):
    return member.status in {"member", "administrator", "creator"} or (member.status == "restricted" and member.is_member)


class PartyRoomJournal(BaseRequestMiddleware):
    """Persist group metadata before long polling can acknowledge its update batch."""

    def __init__(self, rooms):
        self.rooms = rooms

    async def __call__(self, make_request, bot, method):
        result = await make_request(bot, method)
        if method.__api_method__ == "getUpdates":
            last = self.rooms.storage.room_last_observed_at(bot.id)
            if last and time.time() - last >= 20 * 3600:
                for chat_id in self.rooms.by_chat:
                    self.rooms.storage.journal_room_review(bot.id, chat_id, f"gap:{chat_id}:{int(last)}",
                        "Polling outage may have lost history metadata; manual cleanup required")
            batches = []
            for update in result:
                events = []
                message = update.message
                if message and message.chat.id in self.rooms.by_chat:
                    events.append({"kind": "message", "payload": {
                        "chatId": str(message.chat.id), "messageId": message.message_id,
                        "sentAt": int(message.date.timestamp()),
                        "service": bool(message.group_chat_created or message.supergroup_chat_created or message.forum_topic_created),
                        **({"userId": str(message.from_user.id)} if message.from_user and not message.from_user.is_bot else {}),
                    }})
                    if message.migrate_to_chat_id or message.migrate_from_chat_id:
                        events.append({"kind": "review", "payload": {"chatId": str(message.chat.id), "reason": "Group ID changed; manual reconnection required"}})
                request = update.chat_join_request
                query_id = getattr(request, "query_id", None) if request else None
                if request and (query_id or request.chat.id in self.rooms.by_chat):
                    events.append({"kind": "join-query" if query_id else "join", "payload": {
                        "chatId": str(request.chat.id), "userId": str(request.from_user.id),
                        "inviteLink": request.invite_link.invite_link if request.invite_link else "",
                        **({"queryId": query_id, "sentAt": int(request.date.timestamp())} if query_id else {}),
                    }})
                change = update.chat_member
                if change and change.chat.id in self.rooms.by_chat and (member_present(change.old_chat_member) != member_present(change.new_chat_member) or change.new_chat_member.status == "kicked"):
                    events.append({"kind": "presence", "payload": {
                        "chatId": str(change.chat.id), "userId": str(change.new_chat_member.user.id),
                        "event": "joined" if member_present(change.new_chat_member) else "left",
                        "actorId": str(change.from_user.id),
                    }})
                mine = update.my_chat_member
                if mine and mine.chat.id in self.rooms.by_chat and (mine.new_chat_member.status != "administrator"
                    or not all(getattr(mine.new_chat_member, right, False) for right in ("can_delete_messages", "can_restrict_members", "can_invite_users", "can_change_info", "can_pin_messages"))):
                    events.append({"kind": "review", "payload": {"chatId": str(mine.chat.id), "reason": "Bot administrator rights removed"}})
                batches.append((update.update_id, events))
            self.rooms.storage.journal_room_updates(bot.id, batches)
            # Native guard decisions have a ten-second deadline. Dispatch after
            # durable journaling, without waiting behind background cleanup.
            self.rooms.dispatch_join_queries()
            if any(events for _, events in batches):
                self.rooms.wakeup.set()
        elif isinstance(result, Message) and result.chat.id in self.rooms.by_chat and result.message_id:
            self.rooms.storage.journal_room_message(bot.id, result.chat.id, result.message_id, int(result.date.timestamp()))
        return result
