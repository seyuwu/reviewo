import asyncio
from datetime import UTC, datetime
from html import escape
import logging
import time
from urllib.parse import urlencode
from uuid import UUID

from aiogram.exceptions import TelegramAPIError, TelegramBadRequest, TelegramForbiddenError, TelegramNetworkError, TelegramRetryAfter, TelegramServerError
from aiogram.types import ChatPermissions, InlineKeyboardButton, InlineKeyboardMarkup

from ..api.client import ApiError
from .join_request_query import AnswerChatJoinRequestQuery
from .telegram_session import is_connection_setup_failure
from .party_room_review import review_code_for_reason, review_details
from ..ui.formatters import telegram_contact_text

logger = logging.getLogger(__name__)
REQUIRED_RIGHTS = ("can_change_info", "can_delete_messages", "can_restrict_members", "can_invite_users", "can_pin_messages")


class RoomReadUnavailable(TelegramNetworkError):
    """A failed read cannot make the group's history uncertain."""


class RoomReviewError(ValueError):
    def __init__(self, message, code="unknown"):
        super().__init__(message)
        self.code = code


class RoomConfigurationError(RoomReviewError):
    """A confirmed configuration problem, without an uncertain Telegram write."""


class RoomCleanupRetry(Exception):
    """A known, repeatable cleanup operation can safely resume after a lost reply."""


def permissions(enabled):
    return ChatPermissions(can_send_messages=enabled, can_send_audios=enabled, can_send_documents=enabled,
        can_send_photos=enabled, can_send_videos=enabled, can_send_video_notes=enabled, can_send_voice_notes=enabled,
        can_send_polls=enabled, can_send_other_messages=enabled, can_add_web_page_previews=enabled,
        can_invite_users=False, can_change_info=False, can_pin_messages=False, can_manage_topics=False)


class PartyRooms:
    def __init__(self, bot, api, settings, storage):
        self.bot, self.api, self.settings, self.storage = bot, api, settings, storage
        self.enabled = getattr(settings, "party_rooms_enabled", False)
        self.by_chat = {int(room["chatId"]): room for room in storage.saved_party_rooms(bot.id)}
        self.wakeup = asyncio.Event()
        self.sync_after = 0.0
        self.next_operation = 0.0
        self.mutation_lock = asyncio.Lock()
        self.room_locks = {}
        self.validated_at = {}
        self.expiry_cache = {}
        self.maintenance_after = {}
        self.hint_queue = {}
        self.next_hint = 0.0
        self.notice_rooms = {}
        self.ready_cooldowns = {}
        self.dota_id_locks = {}
        self.dota_id_cooldowns = {}
        self.discord_cooldowns = {}
        self.discord_chat_requests = {}
        self.ping_cooldowns = {}
        self.ping_chat_requests = {}
        self.alert_queue = {}
        self.transient_attempts = {}
        self.operation_after = {}
        self.private_after = {}
        self.registration_results = {}
        self.registration_after = {}
        self.sync_lock = asyncio.Lock()
        self.join_query_tasks = {}
        self.join_query_releases = set()
        self.join_query_slots = asyncio.Semaphore(3)
        self.last_poll_started_at = 0.0

    def dispatch_join_queries(self):
        for event in self.storage.pending_room_join_queries(self.bot.id):
            if event["id"] not in self.join_query_tasks:
                task = asyncio.create_task(self.handle_join_query(event))
                self.join_query_tasks[event["id"]] = task
                task.add_done_callback(lambda done, event_id=event["id"]: self.join_query_tasks.pop(event_id, None))

    async def answer_join(self, room, value, allowed):
        if value.get("queryId"):
            confirmed = await self.bot(AnswerChatJoinRequestQuery(chat_join_request_query_id=value["queryId"],
                                      result="approve" if allowed else "decline"), request_timeout=2)
            if not confirmed:
                raise ValueError("Join decision was not acknowledged")
            value["queryAnswered"] = True
        else:
            await self.mutate("approve_chat_join_request" if allowed else "decline_chat_join_request",
                              int(room["chatId"]), int(value["userId"]))

    async def handle_join_query(self, event):
        value = event["payload"]
        remaining = value["sentAt"] + 8 - time.time()
        if remaining <= 0:
            self.storage.acknowledge_room_events([event["id"]])
            return
        cancelled = False
        try:
            async with asyncio.timeout(remaining):
                async with self.join_query_slots:
                    if not self.enabled or int(value["chatId"]) not in self.by_chat:
                        await self.answer_join(None, value, False)
                    else:
                        async with self.room_locks.setdefault(int(value["chatId"]), asyncio.Lock()):
                            await self.process_event(event)
        except asyncio.CancelledError:
            cancelled = True
            if event.get("admissionStarted"):
                self.storage.journal_room_review(self.bot.id, int(value["chatId"]), "query-uncertain:" + value["queryId"],
                    "Native admission interrupted; inspect participants")
            raise
        except Exception:
            if event.get("admissionStarted"):
                self.storage.journal_room_review(self.bot.id, int(value["chatId"]), "query-uncertain:" + value["queryId"],
                    "Native admission outcome uncertain; inspect participants")
                self.wakeup.set()
            logger.warning("Native group admission could not finish; approval will not be repeated")
        finally:
            if not cancelled:
                if not value.get("queryAnswered") and time.time() < value["sentAt"] + 9:
                    try:
                        async with asyncio.timeout(max(.1, value["sentAt"] + 9.7 - time.time())):
                            await self.answer_join(None, value, False)
                    except (TelegramAPIError, TimeoutError):
                        pass
                self.storage.acknowledge_room_events([event["id"]])

    async def close_join_queries(self):
        tasks = list(self.join_query_tasks.values())
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        releases = list(self.join_query_releases)
        if releases:
            done, pending = await asyncio.wait(releases, timeout=2)
            for task in pending:
                task.cancel()
            await asyncio.gather(*releases, return_exceptions=True)

    async def request(self, method, path, body=None):
        if method == "GET":
            path += ("&" if "?" in path else "?") + urlencode({"botId": str(self.bot.id), "lastPolledAt": str(self.storage.room_last_observed_at(self.bot.id) if self.enabled else 0)})
        else:
            body = {"botId": str(self.bot.id), **(body or {})}
        return await self.api.rooms_request(method, path, body)

    async def mutate(self, method, *args, **kwargs):
        # Background mutations have a small independent budget, leaving core flows available.
        async with self.mutation_lock:
            await asyncio.sleep(max(0, self.next_operation - time.monotonic()))
            self.next_operation = time.monotonic() + .2
            kwargs.setdefault("request_timeout", 15)
            if not isinstance(method, str):
                return await self.bot(method, **kwargs)
            return await getattr(self.bot, method)(*args, **kwargs)

    async def read(self, method, *args, **kwargs):
        kwargs.setdefault("request_timeout", 15)
        try:
            return await getattr(self.bot, method)(*args, **kwargs)
        except (TelegramNetworkError, TelegramServerError) as error:
            raise RoomReadUnavailable(method=error.method, message="Telegram group read unavailable") from error

    async def for_user(self, user_id, slug):
        if not self.enabled:
            return None
        try:
            # Room service latency must not hold up the user's main bot panel.
            async with asyncio.timeout(2):
                result = await self.request("POST", "/reserve", {"userId": str(user_id), "slug": slug})
            if result:
                cached = self.notice_rooms.get(result["id"], {})
                if cached.get("state") != result["state"] or cached.get("generation") != result["generation"]:
                    self.sync_after = 0
            self.wakeup.set()
            return result
        except (ApiError, TimeoutError):
            self.sync_after = 0
            self.wakeup.set()
            return None

    async def validate_group(self, chat_id, *, owner_id=None):
        chat = await self.read("get_chat", chat_id)
        if chat.type != "supergroup":
            raise RoomConfigurationError("Нужна супергруппа. В настройках группы включи «Темы», затем выключи и добавь группу ещё раз.", "private_group")
        if chat.username or chat.is_forum:
            raise RoomConfigurationError("Группа должна быть приватной и без тем.", "private_group")
        room = self.by_chat.get(chat_id, {})
        if (getattr(chat, "has_visible_history", False) and owner_id is None
            and not room.get("data", {}).get("historyBaselineAt") and room.get("state") not in {"ACTIVE", "ROTATING", "CLOSING"}):
            raise RoomReviewError("Visible history needs an initial owner cleanup confirmation", "history_baseline")
        member = await self.read("get_chat_member", chat_id, self.bot.id)
        if member.status != "administrator":
            raise RoomConfigurationError("FDP должен быть администратором группы.", "bot_admin")
        missing = next((right for right in REQUIRED_RIGHTS if not getattr(member, right, False)), None)
        if missing:
            raise RoomConfigurationError("Боту нужны права менять информацию, удалять сообщения, блокировать, приглашать и закреплять.", "right_" + missing.removeprefix("can_"))
        admins = await self.read("get_chat_administrators", chat_id, return_bots=True)
        if any(admin.user.is_bot and admin.user.id != self.bot.id for admin in admins):
            raise RoomConfigurationError("В этой группе уже есть другой бот. Для подключения оставь одного обслуживающего бота.", "admins_changed")
        humans = [str(admin.user.id) for admin in admins if not admin.user.is_bot]
        if owner_id is not None:
            owner = await self.read("get_chat_member", chat_id, owner_id)
            if owner.status != "creator":
                raise ValueError("Подключить группу может её владелец.")
            if await self.read("get_chat_member_count", chat_id) != len(admins):
                raise ValueError("Перед подключением оставь только администрацию и бота. История группы должна быть пустой.")
        return chat, humans

    async def sync(self):
        async with self.sync_lock:
            await self._sync()

    async def _sync(self):
        previous = self.notice_rooms
        rows = await self.request("GET", "/worker")
        if not isinstance(rows, list):
            raise ApiError("Invalid Telegram group pool response")
        self.by_chat = {int(room["chatId"]): room for room in rows}
        # Store only routing metadata locally; invite URLs and roster stay on the API.
        self.storage.save_party_rooms(self.bot.id, [{"id": room["id"], "chatId": room["chatId"], "botId": room["botId"]} for room in rows])
        notices = rows if getattr(self.settings, "room_worker_only", False) else await self.request("GET", "/notices")
        self.notice_rooms = {room["id"]: room for room in notices}
        if not getattr(self.settings, "room_worker_only", False):
            for source in self.storage.room_admin_alert_sources():
                current = self.notice_rooms.get(source["roomId"])
                new_review = (source["kind"].startswith("party_room_alert:") and source.get("reviewId") and current
                    and current.get("data", {}).get("reviewId") and source["reviewId"] != current["data"]["reviewId"])
                if not current or current["state"] not in {"REVIEW", "CLOSING"} or new_review:
                    self.resolve_admin_alerts(source["roomId"])
            for key in list(self.alert_queue):
                if self.notice_rooms.get(key[1], {}).get("state") != "REVIEW":
                    self.alert_queue.pop(key, None)
        for room in notices:
            old = previous.get(room["id"], {})
            if not getattr(self.settings, "room_worker_only", False) and room["state"] == "REVIEW":
                for admin_id in self.settings.admin_ids:
                    if not self.storage.get_choice(admin_id, "party_room_alert:" + room["id"], 0):
                        self.alert_queue[(admin_id, room["id"])] = room
            if not getattr(self.settings, "room_worker_only", False) and room.get("partyId"):
                roster = room["data"].get("roster", [])
                previous_roster = old.get("data", {}).get("roster", [])
                if (old.get("generation") != room["generation"] or old.get("state") != room["state"]
                        or previous_roster != roster or old.get("data", {}).get("presentIds") != room["data"].get("presentIds")):
                    targets = roster + previous_roster
                else:
                    previous_members = {(member.get("membershipId"), member.get("telegramId")) for member in previous_roster}
                    targets = [member for member in roster if (member.get("membershipId"), member.get("telegramId")) not in previous_members]
                for member in targets:
                    if member.get("telegramId"):
                        self.hint_queue[(int(member["telegramId"]), room["partyId"])] = room

    def lease_body(self, room):
        return {"leaseToken": room["leaseToken"], "generation": room["generation"]}

    async def report(self, room, event, **fields):
        updated = await self.request("POST", f"/{room['id']}/report", {**self.lease_body(room), "event": event, **fields})
        if isinstance(updated, dict):
            room.update(updated)
        return updated

    async def release(self, room):
        if not room.get("leaseToken"):
            return
        try:
            await self.request("POST", f"/{room['id']}/release", self.lease_body(room))
            room["leaseUntil"] = None
            room["leaseToken"] = None
        except ApiError:
            logger.warning("Could not release Telegram group operation lease")

    async def flush_messages(self):
        events = self.storage.pending_room_messages(self.bot.id)
        if events:
            await self.request("POST", "/track", {"messages": [event["payload"] for event in events]})
            self.storage.acknowledge_room_events([event["id"] for event in events])
        return bool(events)

    async def process_event(self, event):
        value = event["payload"]
        found = self.by_chat.get(int(value["chatId"]))
        if not found:
            self.storage.acknowledge_room_events([event["id"]])
            return
        if event["kind"] == "invite":
            await self.recover_invite(event, found)
            return
        if event["kind"] == "presence":
            await self.request("POST", "/presence", value)
            self.sync_after = 0
        elif event["kind"] in {"join", "join-query", "review"}:
            room = await self.request("POST", f"/{found['id']}/claim")
            if value.get("queryId"):
                for _ in range(12):
                    if room:
                        break
                    await asyncio.sleep(.2)
                    room = await self.request("POST", f"/{found['id']}/claim")
            if not room:
                if value.get("queryId"):
                    await self.answer_join(None, value, False)
                    return
                self.storage.retry_room_event(event["id"], time.time() + 1)
                return
            admission_started = False
            try:
                if event["kind"] == "review":
                    await self.report(room, "review", reason=value["reason"], errorCode=review_code_for_reason(value["reason"]))
                else:
                    allowed = await self.request("POST", f"/{room['id']}/admission", {
                        "userId": value["userId"], "inviteLink": value["inviteLink"]})
                    if not allowed.get("allowed") or allowed.get("generation") != room["generation"]:
                        await self.answer_join(room, value, False)
                    else:
                        if not value.get("queryId"):
                            member = await self.read("get_chat_member", int(room["chatId"]), int(value["userId"]))
                            if member.status == "kicked":
                                # Only lift a bot-owned removal; a moderator's ban needs manual review.
                                eligible = await self.request("POST", f"/{room['id']}/eligible", {
                                    "userId": value["userId"], "generation": room["generation"], "inviteLink": ""})
                                if not eligible.get("allowed") or not eligible.get("botOwnedBan"):
                                    await self.answer_join(room, value, False)
                                    self.storage.acknowledge_room_events([event["id"]])
                                    return
                                await self.mutate("unban_chat_member", int(room["chatId"]), int(value["userId"]), only_if_banned=True)
                                await self.report(room, "member-unbanned", userId=value["userId"])
                        await self.report(room, "admitting", userId=value["userId"])
                        admission_started = True
                        event["admissionStarted"] = True
                        await self.answer_join(room, value, True)
                        check = await self.request("POST", f"/{room['id']}/admission", {
                            "userId": value["userId"], "inviteLink": value["inviteLink"]})
                        if not check.get("allowed") or check.get("generation") != room["generation"]:
                            await self.remove_member(room, value["userId"])
                        else:
                            if not value.get("queryId"):
                                await self.mutate("restrict_chat_member", int(room["chatId"]), int(value["userId"]),
                                    permissions=permissions(True), use_independent_chat_permissions=True)
                            # Guard approval uses the active group's default
                            # permissions and never lifts a moderator restriction.
                            await self.report(room, "joined", userId=value["userId"])
            except TelegramNetworkError:
                if admission_started:
                    await self.report(room, "review", reason="Telegram admission outcome uncertain; inspect participants", errorCode="admission_uncertain")
                raise
            finally:
                if value.get("queryId"):
                    task = asyncio.create_task(self.release(room))
                    self.join_query_releases.add(task)
                    task.add_done_callback(self.join_query_releases.discard)
                else:
                    await self.release(room)
        self.storage.acknowledge_room_events([event["id"]])

    async def recover_invite(self, event, found):
        invite_link = self.storage.room_invite_link(event["payload"])
        snapshot = await self.request("GET", f"/{found['id']}/status")
        data = snapshot["data"]
        tracked = (data.get("pendingInvite") or {}).get("url") == invite_link or any(link["url"] == invite_link for link in data.get("links", []))
        if tracked:
            self.storage.acknowledge_room_events([event["id"]])
            self.by_chat[int(snapshot["chatId"])] = snapshot
            self.sync_after = 0
            return
        room = await self.request("POST", f"/{found['id']}/claim")
        if not room:
            self.storage.retry_room_event(event["id"], time.time() + 2)
            return
        try:
            data = room["data"]
            tracked = (data.get("pendingInvite") or {}).get("url") == invite_link or any(link["url"] == invite_link for link in data.get("links", []))
            if tracked:
                pass
            elif room["generation"] == event["payload"]["generation"] and room["state"] in {"PREPARING", "ROTATING"} and not data.get("pendingInvite") and not any(not link["revoked"] for link in data.get("links", [])):
                await self.report(room, "invite-created", inviteLink=invite_link)
            else:
                await self.report(room, "review", inviteLink=invite_link, reason="Untracked invitation recovered after interrupted preparation", errorCode="invitation_uncertain")
            self.storage.acknowledge_room_events([event["id"]])
            self.sync_after = 0
        finally:
            await self.release(room)
            self.by_chat[int(room["chatId"])] = room

    async def revoke(self, room, *, preserve_pending=False):
        links = list(room["data"].get("links", []))
        pending = room["data"].get("pendingInvite")
        if pending and not preserve_pending:
            links.append({"url": pending["url"], "revoked": False})
        for link in links:
            if link["revoked"]:
                continue
            try:
                result = await self.mutate("revoke_chat_invite_link", int(room["chatId"]), link["url"])
                if not result.is_revoked:
                    raise ValueError("Invite revocation not confirmed")
            except TelegramBadRequest as error:
                if not any(code in str(error).upper() for code in ("INVITE_HASH_EXPIRED", "INVITE_HASH_INVALID")):
                    raise
            await self.report(room, "link-revoked", inviteLink=link["url"])

    async def remove_members(self, room):
        data = room["data"]
        targets = list(data.get("evictIds", []))
        if room["state"] == "CLOSING":
            targets += [user for user in data.get("presentIds", []) + data.get("seenIds", []) + data.get("possibleIds", []) if user not in data.get("staffIds", [])]
        for user_id in dict.fromkeys(targets):
            if user_id in room["data"].get("cleanupDoneIds", []):
                continue
            check = await self.request("POST", f"/{room['id']}/eligible", {
                "userId": user_id, "generation": room["generation"], "inviteLink": ""})
            if check.get("generation") != room["generation"]:
                raise ApiError("Party membership changed before removal", 409)
            if not check.get("mayRemove"):
                continue
            await self.remove_member(room, user_id)

    async def remove_member(self, room, user_id):
        member = await self.read("get_chat_member", int(room["chatId"]), int(user_id))
        absent = member.status == "left" or member.status == "restricted" and not getattr(member, "is_member", False)
        owned_ban = member.status == "kicked" and user_id in room["data"].get("botBannedIds", [])
        purged_before = int(time.time())
        if not absent and member.status != "kicked":
            if not await self.mutate("ban_chat_member", int(room["chatId"]), int(user_id), revoke_messages=True):
                raise RoomCleanupRetry("Participant removal awaits acknowledgement")
            # A successful ban can precede its read/update. Keep the removal pending;
            # the durable actor journal also recovers ownership after a restart.
            for attempt in range(3):
                try:
                    member = await self.bot.get_chat_member(int(room["chatId"]), int(user_id), request_timeout=5)
                except (TelegramNetworkError, TelegramServerError) as error:
                    raise RoomCleanupRetry("Participant removal confirmation temporarily unavailable") from error
                if member.status in {"kicked", "left"} or member.status == "restricted" and not getattr(member, "is_member", False):
                    break
                if attempt < 2:
                    await asyncio.sleep(.25 * (attempt + 1))
            else:
                raise RoomCleanupRetry("Participant removal confirmation is delayed")
            owned_ban = member.status == "kicked"
        await self.report(room, "member-removed", userId=user_id, ownedBan=owned_ban, purgedBefore=purged_before)

    async def delete_batch(self, room):
        batch = await self.request("POST", f"/{room['id']}/deletions", self.lease_body(room))
        if not batch:
            return False
        old = any((datetime.now(UTC) - datetime.fromisoformat(item["sentAt"].replace("Z", "+00:00"))).total_seconds() >= 48 * 3600 for item in batch)
        ids = [item["messageId"] for item in batch]
        try:
            success = await self.cleanup_mutate("delete_messages", int(room["chatId"]), ids)
        except TelegramBadRequest as error:
            if old and any(value in str(error).lower() for value in ("can't be deleted", "cannot be deleted", "message_delete_forbidden")):
                raise RoomReviewError("Existing old messages need owner cleanup", "old_messages") from error
            raise
        if not success:
            raise RoomCleanupRetry("Message deletion awaits acknowledgement")
        await self.request("POST", f"/{room['id']}/deleted", {**self.lease_body(room), "messageIds": ids})
        return True

    async def cleanup_mutate(self, method, *args, **kwargs):
        # Only these known targets are safe to replay. Admission/invite creation and
        # participant bans retain the existing ownership/uncertainty handling.
        if method not in {"delete_messages", "set_chat_title", "set_chat_permissions"}:
            raise ValueError("Operation is not repeatable cleanup")
        try:
            return await self.mutate(method, *args, **kwargs)
        except (TelegramNetworkError, TelegramServerError) as error:
            raise RoomCleanupRetry("Telegram cleanup acknowledgement unavailable") from error
        except TelegramBadRequest as error:
            if method in {"set_chat_title", "set_chat_permissions"} and "not modified" in str(error).lower():
                return True
            raise

    async def restore_eligible_members(self, room):
        banned = set(room["data"].get("botBannedIds", []))
        for member in room["data"].get("roster", []):
            user_id = member.get("telegramId")
            if not user_id or user_id not in banned:
                continue
            check = await self.request("POST", f"/{room['id']}/eligible", {
                "userId": user_id, "generation": room["generation"], "inviteLink": ""})
            if not check.get("allowed") or not check.get("botOwnedBan"):
                continue
            await self.mutate("unban_chat_member", int(room["chatId"]), int(user_id), only_if_banned=True)
            await self.report(room, "member-unbanned", userId=user_id)

    async def finish_card(self, room):
        if room["data"].get("cardPendingPin") and room["data"].get("cardId"):
            message_id = room["data"]["cardId"]
            await self.mutate("pin_chat_message", int(room["chatId"]), message_id, disable_notification=True)
            await self.report(room, "card-pinned", messageId=message_id)
        obsolete = room["data"].get("cardObsoleteIds", [])[:100]
        if obsolete:
            if not await self.cleanup_mutate("delete_messages", int(room["chatId"]), obsolete):
                raise RoomCleanupRetry("Previous party card deletion awaits acknowledgement")
            await self.request("POST", f"/{room['id']}/deleted", {**self.lease_body(room), "messageIds": obsolete})
            room["data"]["cardObsoleteIds"] = [value for value in room["data"].get("cardObsoleteIds", []) if value not in obsolete]

    async def update_card(self, room):
        await self.finish_card(room)
        card = await self.request("GET", f"/{room['id']}/card")
        if card.get("generation") != room["generation"]:
            raise ApiError("Party group changed", 409)
        join_version = card.get("joinVersion", 0)
        replace_card = join_version > room["data"].get("cardPostedJoinVersion", 0)
        if replace_card and time.time() * 1000 < card.get("refreshAfter", 0):
            return
        members = card.get("members", [])
        text = f"🎮 <b>{escape(str(card.get('name') or 'Пати FDP'))}</b>\n"
        text += f"Состав: <b>{len(members)}/5</b> · Готовы: <b>{sum(bool(member.get('ready')) for member in members)}/{len(members)}</b>\n\n"
        for member in sorted(members, key=lambda item: item.get("role") or "9"):
            name = escape(member["name"][:50])
            role = escape(member.get("role") or "—")
            text += f"{'✅' if member.get('ready') else '❌'} {role} · <b>{name}</b>"
            if member.get("mmr") is not None:
                text += " · " + escape(str(member["mmr"])) + " MMR"
            contact = telegram_contact_text(member)
            if contact:
                text += "\n📱 " + contact
            text += "\nDota ID: " + escape(str(member.get("dotaAccountId") or "не указан")) + "\n"
        text += "\nПоздоровайтесь и договоритесь об игре.\nЧат временный: после завершения пати переписка удаляется."
        if any(not member.get("dotaAccountId") for member in members):
            text += "\n\n🎮 Dota ID можно указать прямо здесь: нажми кнопку и ответь боту цифрами."
        row = [InlineKeyboardButton(text="✅ Готов играть", callback_data=f"roomready:{room['id']}:{room['generation']}")]
        if len(members) > 1:
            row.append(InlineKeyboardButton(text="🔔 Позвать в чат", callback_data=f"roomping:{room['id']}:{room['generation']}"))
        actions = [InlineKeyboardButton(text="⚙️ Управлять пати",
            url=f"https://t.me/{getattr(self.settings, 'main_bot_username', 'FDPdotabot')}?start=manage_{UUID(room['partyId']).hex}")]
        if card.get("discordAvailable"):
            actions.append(InlineKeyboardButton(text="🔊 Discord", callback_data=f"roomdiscord:{room['id']}:{room['generation']}"))
        rows = [row, actions]
        if any(not member.get("dotaAccountId") for member in members):
            rows.append([InlineKeyboardButton(text="🎮 Указать Dota ID",
                callback_data=f"roomdota:{room['id']}:{room['generation']}")])
        markup = InlineKeyboardMarkup(inline_keyboard=rows)
        message_id = room["data"].get("cardId")
        if message_id and not replace_card:
            try:
                await self.mutate("edit_message_text", text, chat_id=int(room["chatId"]), message_id=message_id,
                    parse_mode="HTML", reply_markup=markup, disable_web_page_preview=True)
            except TelegramBadRequest as error:
                if "not modified" not in str(error).lower():
                    raise
        else:
            message = await self.mutate("send_message", int(room["chatId"]), text, parse_mode="HTML",
                reply_markup=markup, disable_web_page_preview=True)
            message_id = message.message_id
            # The session journal records this outbound message before returning.
            await self.report(room, "card", messageId=message_id, cardJoinVersion=join_version)
            await self.finish_card(room)
            return
        await self.report(room, "card", messageId=message_id, cardJoinVersion=join_version)

    async def operate(self, room):
        if self.awaiting_cleanup_poll(room):
            return
        chat_id = int(room["chatId"])
        if room["state"] != "ACTIVE" or time.time() - self.validated_at.get(room["id"], 0) >= 120:
            chat, staff = await self.validate_group(chat_id)
            if set(staff) != set(room["data"].get("staffIds", [])):
                raise RoomConfigurationError("Administrator list changed; manual review required", "admins_changed")
            if (getattr(chat, "has_visible_history", False) and not room["data"].get("historyBaselineAt")
                and not room["data"].get("cleanupUncertain")):
                await self.report(room, "history-visible")
            self.validated_at[room["id"]] = time.time()
        settling = room["state"] == "CLOSING" and room["data"].get("cleanupFenceAt")
        if room["state"] == "ROTATING":
            # Invitation rotation must not mute the players who remain in the party.
            # This also repairs a chat frozen by an interrupted older rotation.
            await self.cleanup_mutate("set_chat_permissions", chat_id, permissions(True), use_independent_chat_permissions=True)
        if room["state"] in {"PREPARING", "CLOSING"} and not settling:
            await self.cleanup_mutate("set_chat_permissions", chat_id, permissions(False), use_independent_chat_permissions=True)
        if room["state"] in {"PREPARING", "ROTATING", "CLOSING"} and not settling:
            pending = room["data"].get("pendingInvite")
            preserve_pending = room["state"] in {"PREPARING", "ROTATING"} and pending and pending["generation"] == room["generation"]
            await self.revoke(room, preserve_pending=bool(preserve_pending))
            while await self.flush_messages():
                pass
            await self.remove_members(room)
        if room["state"] == "CLOSING":
            if not room["data"].get("cleanupFenceAt"):
                for user_id in list(room["data"].get("botBannedIds", [])):
                    check = await self.request("POST", f"/{room['id']}/eligible", {
                        "userId": user_id, "generation": room["generation"], "inviteLink": ""})
                    if not check.get("botOwnedBan"):
                        continue
                    await self.mutate("unban_chat_member", chat_id, int(user_id), only_if_banned=True)
                    await self.report(room, "member-unbanned", userId=user_id)
                await self.cleanup_mutate("set_chat_title", chat_id, room["title"])
                await self.report(room, "cleanup-fenced")
                return
            fence = datetime.fromisoformat(room["data"]["cleanupFenceAt"].replace("Z", "+00:00")).timestamp()
            if self.last_poll_started_at < fence:
                return
            while await self.flush_messages():
                pass
            if await self.delete_batch(room):
                return
            admins = await self.read("get_chat_administrators", chat_id, return_bots=True)
            if await self.read("get_chat_member_count", chat_id) != len(admins):
                raise RoomReviewError("Untracked participants remain in the group", "unknown_participants")
            await self.report(room, "closed", pollStartedAt=int(self.last_poll_started_at * 1000))
            return
        if room["state"] == "PREPARING":
            while await self.flush_messages():
                pass
            if await self.delete_batch(room):
                return
            await self.mutate("set_chat_title", chat_id, ("FDP · " + room["data"].get("partyName", "Пати"))[:128])
        if room["state"] in {"PREPARING", "ROTATING"}:
            await self.restore_eligible_members(room)
            expiry = datetime.fromisoformat(room["data"]["expiresAt"].replace("Z", "+00:00"))
            if expiry <= datetime.now(UTC):
                await self.report(room, "retry", retrySeconds=30)
                return
            pending = room["data"].get("pendingInvite")
            if pending:
                invite_link = pending["url"]
                await self.mutate("edit_chat_invite_link", chat_id, invite_link, expire_date=expiry, creates_join_request=True)
            else:
                invite = await self.mutate("create_chat_invite_link", chat_id, creates_join_request=True,
                    expire_date=expiry, name=f"FDP {room['generation']}")
                invite_link = invite.invite_link
                event_id = self.storage.journal_room_invite(self.bot.id, chat_id, room["generation"], invite_link)
                await self.report(room, "invite-created", inviteLink=invite_link)
                self.storage.acknowledge_room_events([event_id])
            await self.mutate("set_chat_permissions", chat_id, permissions(True), use_independent_chat_permissions=True)
            try:
                await self.report(room, "prepared" if room["state"] == "PREPARING" else "rotated", inviteLink=invite_link)
            except ApiError:
                # A lost publication response does not prove the transaction failed.
                # The pending receipt also lets the next worker resume safely.
                snapshot = await self.request("GET", f"/{room['id']}/status")
                if snapshot["generation"] != room["generation"] or snapshot["state"] != "ACTIVE" or not any(
                    link["url"] == invite_link and not link["revoked"] for link in snapshot["data"].get("links", [])):
                    raise ApiError("Invitation publication awaits reconciliation", 409)
                lease_token, lease_until = room["leaseToken"], room["leaseUntil"]
                room.update(snapshot)
                # Readback must never take ownership of another worker's newer lease.
                room["leaseToken"], room["leaseUntil"] = lease_token, lease_until
            self.expiry_cache[(room["id"], invite_link)] = room["data"]["expiresAt"]
            self.sync_after = 0
            self.wakeup.set()
            # Publish access before the roster card and routine maintenance.
            return
        if room["state"] == "ACTIVE":
            # During an active party ordinary chat permissions are open; admission is checked before joining.
            if room["data"].get("evictIds"):
                await self.remove_members(room)
            await self.restore_eligible_members(room)
            link = next((link["url"] for link in room["data"].get("links", []) if not link["revoked"]), None)
            expiry = room["data"].get("expiresAt")
            if link and expiry and self.expiry_cache.get((room["id"], link)) != expiry:
                deadline = datetime.fromisoformat(expiry.replace("Z", "+00:00"))
                if deadline > datetime.now(UTC):
                    await self.mutate("edit_chat_invite_link", chat_id, link, expire_date=deadline, creates_join_request=True)
                    self.expiry_cache[(room["id"], link)] = expiry
            if (room["data"].get("cardDirty") or room["data"].get("cardPendingPin") or room["data"].get("cardObsoleteIds")
                or time.time() >= self.maintenance_after.get(room["id"], 0)):
                await self.update_card(room)
            await self.delete_batch(room)
            self.maintenance_after[room["id"]] = time.time() + 60

    async def refresh_hint(self, user_id, party_id, room):
        fresh = await self.for_user(user_id, room["data"]["partySlug"])
        ping_key = "party_room_ping_link:" + party_id
        ping_link = self.storage.get_choice(user_id, ping_key, 0)
        if fresh is None and room["state"] == "ACTIVE" and any(str(member.get("telegramId")) == str(user_id) for member in room["data"].get("roster", [])):
            raise ApiError("Chat availability lookup failed; retry notification", 503)
        if not fresh or fresh.get("partyId") != party_id:
            if room["state"] in {"CLOSING", "FREE"}:
                from .party_notice_cleanup import expire_party_notices
                expire_party_notices(self.storage, party_id, user_id)
            await self.refresh_private_controls(user_id, party_id)
            return
        if isinstance(ping_link, dict) and fresh.get("inviteLink") and ping_link.get("url") != fresh["inviteLink"]:
            markup = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="💬 Открыть чат пати", url=fresh["inviteLink"])]])
            try:
                await self.bot.edit_message_reply_markup(chat_id=user_id, message_id=ping_link["messageId"], reply_markup=markup)
                ping_link["url"] = fresh["inviteLink"]
                self.storage.set_choices(user_id, ping_key, [ping_link])
            except TelegramBadRequest:
                self.storage.set_choices(user_id, ping_key, [])
        from .party_ready import deliver_native_party_notice
        await deliver_native_party_notice(self.bot, self.api, self.storage, user_id, room["data"]["partySlug"], room=fresh)
        await self.refresh_private_controls(user_id, party_id)

    async def refresh_private_controls(self, user_id, party_id):
        panel = self.storage.get_panel(user_id)
        panel_context = self.storage.get_choice(user_id, "party_room_panel", 0)
        if panel and panel.screen == "party" and isinstance(panel_context, dict) and panel_context.get("partyId") == party_id:
            from .panel import edit_panel
            await edit_panel(self.bot, self.storage, self.api, self.settings, user_id, "party")

    async def send_admin_alert(self, user_id, room):
        key = "party_room_alert:" + room["id"]
        old = self.storage.get_choice(user_id, key, 0)
        if isinstance(old, dict):
            return
        # One alert for the whole unresolved review, including cleanup retries and restarts.
        marker = {"generation": room["generation"], "reviewId": room["data"].get("reviewId"), "sendingAt": time.time()}
        self.storage.set_choices(user_id, key, [marker])
        details = review_details(room)
        text = ("⚠️ <b>Нужна проверка чата пати</b>\n\n" + escape(room["title"])
            + "\n<b>" + escape(details["reason"]) + "</b>\n" + escape(details["action"])
            + "\n\nГруппа исключена из новых выдач до проверки.")
        try:
            message = await self.bot.send_message(user_id, text, parse_mode="HTML", reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
                InlineKeyboardButton(text="Проверить группу", callback_data=f"roomadmin:view:{room['id']}")]]))
        except (TelegramBadRequest, TelegramForbiddenError, TelegramRetryAfter):
            if self.storage.get_choice(user_id, key, 0) == marker:
                self.storage.set_choices(user_id, key, [])
            raise
        except TelegramNetworkError as error:
            if is_connection_setup_failure(error) and self.storage.get_choice(user_id, key, 0) == marker:
                self.storage.set_choices(user_id, key, [])
            raise
        self.storage.track_room_admin_alert(user_id, room["id"], message.chat.id, message.message_id)
        self.storage.set_choices(user_id, key, [{"generation": room["generation"], "reviewId": room["data"].get("reviewId"), "messageId": message.message_id}])

    def resolve_admin_alerts(self, room_id):
        for source in self.storage.room_admin_alert_sources():
            if source["roomId"] != room_id:
                continue
            if source.get("messageId"):
                self.storage.add_temporary_message(source["userId"], source["userId"], source["messageId"], 0)
            self.storage.set_choices(source["userId"], source["kind"], [])
        for key in list(self.alert_queue):
            if key[1] == room_id:
                self.alert_queue.pop(key, None)

    def awaiting_cleanup_poll(self, room):
        fence = room.get("data", {}).get("cleanupFenceAt")
        return (room.get("state") == "CLOSING" and bool(fence)
            and self.last_poll_started_at < datetime.fromisoformat(fence.replace("Z", "+00:00")).timestamp())

    def operation_ready(self, room):
        if self.awaiting_cleanup_poll(room):
            return False
        if time.time() < self.operation_after.get(room["id"], 0):
            return False
        now = datetime.now(UTC)
        for field in ("retryAt", "leaseUntil"):
            if room.get(field) and datetime.fromisoformat(room[field].replace("Z", "+00:00")) > now:
                return False
        return True

    async def worker(self):
        if not self.enabled:
            return
        cursors = {"urgent": 0, "routine": 0}
        urgent_streak = 0
        while True:
            try:
                self.dispatch_join_queries()
                if time.time() >= self.sync_after:
                    self.sync_after = time.time() + 5
                    await self.sync()
                await self.flush_messages()
                for event in self.storage.pending_room_events(self.bot.id, 10):
                    if event["kind"] in {"message", "join-query"}:
                        continue
                    try:
                        await self.process_event(event)
                    except TelegramRetryAfter as error:
                        self.storage.retry_room_event(event["id"], time.time() + error.retry_after + 1)
                    except TelegramBadRequest as error:
                        if any(value in str(error).upper() for value in ("HIDE_REQUESTER_MISSING", "USER_ALREADY_PARTICIPANT", "CHAT_JOIN_REQUEST_NOT_FOUND")):
                            self.storage.acknowledge_room_events([event["id"]])
                        else:
                            self.storage.retry_room_event(event["id"], time.time() + 30)
                    except (ApiError, TelegramAPIError):
                        self.storage.retry_room_event(event["id"], time.time() + 10)
                unresolved_invites = self.storage.unresolved_room_invite_chats(self.bot.id)
                jobs = [room for room in self.by_chat.values() if int(room["chatId"]) not in unresolved_invites
                    and room.get("state") not in {"FREE", "REVIEW", None} and self.operation_ready(room)
                    and (room["state"] != "ACTIVE" or room["data"].get("cardDirty") or room["data"].get("evictIds")
                         or room["data"].get("cardPendingPin") or room["data"].get("cardObsoleteIds")
                         or any(member.get("telegramId") in room["data"].get("botBannedIds", [])
                                for member in room["data"].get("roster", []))
                         or time.time() >= self.maintenance_after.get(room["id"], 0)
                         or any(self.expiry_cache.get((room["id"], link["url"])) != room["data"].get("expiresAt")
                                for link in room["data"].get("links", []) if not link["revoked"]))]
                if jobs:
                    urgent = [room for room in jobs if room["state"] != "ACTIVE" or room["data"].get("evictIds")]
                    routine = [room for room in jobs if room["state"] == "ACTIVE" and not room["data"].get("evictIds")]
                    lane = "urgent" if urgent and (not routine or urgent_streak < 3) else "routine"
                    jobs = urgent if lane == "urgent" else routine
                    candidate = jobs[cursors[lane] % len(jobs)]
                    cursors[lane] += 1
                    urgent_streak = urgent_streak + 1 if lane == "urgent" else 0
                    room = await self.request("POST", f"/{candidate['id']}/claim")
                    if room:
                        try:
                            await self.operate(room)
                            self.transient_attempts.pop(room["id"], None)
                        except TelegramRetryAfter as error:
                            await self.report(room, "retry", retrySeconds=error.retry_after + 1)
                        except RoomCleanupRetry:
                            attempt = min(4, self.transient_attempts.get(room["id"], 0) + 1)
                            self.transient_attempts[room["id"]] = attempt
                            await self.report(room, "retry", retrySeconds=min(30, 5 * 2 ** (attempt - 1)))
                        except ApiError as error:
                            self.operation_after[room["id"]] = time.time() + 5
                            if error.status != 409:
                                logger.warning("Party group API operation failed; will retry")
                        except TelegramNetworkError as error:
                            if isinstance(error, RoomReadUnavailable) or is_connection_setup_failure(error):
                                attempt = min(4, self.transient_attempts.get(room["id"], 0) + 1)
                                self.transient_attempts[room["id"]] = attempt
                                await self.report(room, "retry", retrySeconds=min(30, 5 * 2 ** (attempt - 1)))
                                logger.warning("Temporary Telegram group connection failure; automatic retry scheduled")
                            else:
                                # Only an ambiguous write requires manual inspection.
                                await self.report(room, "review", reason="Telegram transport outcome uncertain", errorCode="transport_uncertain")
                        except RoomConfigurationError as error:
                            await self.report(room, "review", reason=str(error)[:160], errorCode=error.code, cleanupUncertain=False)
                        except (TelegramBadRequest, TelegramForbiddenError) as error:
                            code = "rights" if isinstance(error, TelegramForbiddenError) or any(part in str(error).lower() for part in ("not enough rights", "chat_admin_required")) else "telegram_rejected"
                            await self.report(room, "review", reason="Telegram rejected group operation; check permissions", errorCode=code, cleanupUncertain=False)
                        except RoomReviewError as error:
                            await self.report(room, "review", reason=str(error)[:160], errorCode=error.code)
                        except (TelegramAPIError, ValueError):
                            await self.report(room, "review", reason="Telegram group operation failed; check permissions and cleanup", errorCode="unknown")
                        finally:
                            await self.release(room)
                        self.by_chat[int(room["chatId"])] = room
                        if room.get("state") != candidate.get("state") or room.get("generation") != candidate.get("generation"):
                            self.sync_after = 0
                    else:
                        self.operation_after[candidate["id"]] = time.time() + 2
                eligible_alert = next((key for key in self.alert_queue if self.private_after.get(key[0], 0) <= time.time()), None)
                eligible_hint = next((key for key in self.hint_queue if self.private_after.get(key[0], 0) <= time.time()), None)
                if not getattr(self.settings, "room_worker_only", False) and time.time() >= self.next_hint and (eligible_alert or eligible_hint):
                    retry_hint = False
                    sending_hint = not eligible_alert and bool(eligible_hint)
                    private_delay = 1.1
                    try:
                        if eligible_alert:
                            user_id = eligible_alert[0]
                            alert = self.alert_queue[eligible_alert]
                            await self.send_admin_alert(user_id, alert)
                            if self.alert_queue.get(eligible_alert) is alert:
                                self.alert_queue.pop(eligible_alert, None)
                        else:
                            user_id, party_id = eligible_hint
                            hint = self.hint_queue[eligible_hint]
                            await self.refresh_hint(user_id, party_id, hint)
                            if self.hint_queue.get(eligible_hint) is hint:
                                self.hint_queue.pop(eligible_hint, None)
                    except TelegramForbiddenError:
                        self.storage.mark_bot_user_blocked(user_id)
                        if eligible_alert:
                            self.alert_queue.pop(eligible_alert, None)
                            private_delay = 3600
                        if sending_hint:
                            self.hint_queue.pop(eligible_hint, None)
                    except TelegramBadRequest:
                        if eligible_alert:
                            self.alert_queue.pop(eligible_alert, None)
                            private_delay = 60
                        if sending_hint:
                            self.hint_queue.pop(eligible_hint, None)
                        logger.info("Private chat availability notice could not be updated")
                    except TelegramRetryAfter as error:
                        retry_hint = True
                        private_delay = error.retry_after + 1
                        self.next_hint = time.time() + private_delay
                    except TelegramNetworkError as error:
                        # A saved send marker prevents a second notification;
                        # retrying still updates the user's main entry button.
                        retry_hint = sending_hint or is_connection_setup_failure(error)
                        logger.warning("Could not deliver private chat availability notice")
                    except (ApiError, TelegramAPIError):
                        retry_hint = True
                        logger.warning("Could not refresh private Telegram group invitation")
                    self.private_after[user_id] = time.time() + max(private_delay, 5 if retry_hint else 1.1)
                    self.next_hint = max(self.next_hint, time.time() + .5)
                for user_id in list(self.registration_results):
                    if time.time() >= self.registration_after.get(user_id, 0) and time.time() >= self.private_after.get(user_id, 0):
                        results = self.registration_results.pop(user_id)
                        try:
                            await self.bot.send_message(user_id, "\n\n".join(results)[:4000])
                        except TelegramAPIError:
                            logger.warning("Could not send group setup summary")
                        self.private_after[user_id] = time.time() + 1.1
                self.storage.prune_room_events()
            except asyncio.CancelledError:
                raise
            except (ApiError, TelegramAPIError):
                logger.warning("Telegram group pool unavailable; core bot remains available")
                self.sync_after = time.time() + 15
            except Exception:
                logger.exception("Telegram group pool worker failed")
            self.wakeup.clear()
            try:
                await asyncio.wait_for(self.wakeup.wait(), timeout=.5)
            except TimeoutError:
                pass
