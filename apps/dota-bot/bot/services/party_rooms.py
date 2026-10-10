import asyncio
from datetime import UTC, datetime
from html import escape
import logging
import time
from urllib.parse import urlencode

from aiogram.exceptions import TelegramAPIError, TelegramBadRequest, TelegramNetworkError, TelegramRetryAfter
from aiogram.types import ChatPermissions, InlineKeyboardButton, InlineKeyboardMarkup

from ..api.client import ApiError

logger = logging.getLogger(__name__)
REQUIRED_RIGHTS = ("can_change_info", "can_delete_messages", "can_restrict_members", "can_invite_users", "can_pin_messages")


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
        self.alert_queue = {}
        self.private_after = {}
        self.registration_results = {}
        self.registration_after = {}
        self.sync_lock = asyncio.Lock()

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
            return await getattr(self.bot, method)(*args, **kwargs)

    async def for_user(self, user_id, slug):
        if not self.enabled:
            return None
        try:
            result = await self.request("POST", "/reserve", {"userId": str(user_id), "slug": slug})
            self.wakeup.set()
            return result
        except ApiError:
            return None

    async def validate_group(self, chat_id, *, owner_id=None):
        chat = await self.bot.get_chat(chat_id, request_timeout=15)
        if chat.type != "supergroup":
            raise ValueError("Нужна супергруппа. В настройках группы включи «Темы», затем выключи и добавь группу ещё раз.")
        if chat.username or chat.is_forum:
            raise ValueError("Группа должна быть приватной и без тем.")
        if getattr(chat, "has_visible_history", False):
            raise ValueError("В настройках группы поставь скрытую историю для новых участников.")
        member = await self.bot.get_chat_member(chat_id, self.bot.id, request_timeout=15)
        if member.status != "administrator" or not all(getattr(member, right, False) for right in REQUIRED_RIGHTS):
            raise ValueError("Боту нужны права менять информацию, удалять сообщения, блокировать, приглашать и закреплять.")
        admins = await self.bot.get_chat_administrators(chat_id, return_bots=True, request_timeout=15)
        if any(admin.user.is_bot and admin.user.id != self.bot.id for admin in admins):
            raise ValueError("В этой группе уже есть другой бот. Для подключения оставь одного обслуживающего бота.")
        humans = [str(admin.user.id) for admin in admins if not admin.user.is_bot]
        if owner_id is not None:
            owner = await self.bot.get_chat_member(chat_id, owner_id, request_timeout=15)
            if owner.status != "creator":
                raise ValueError("Подключить группу может её владелец.")
            if await self.bot.get_chat_member_count(chat_id, request_timeout=15) != len(admins):
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
        for room in notices:
            old = previous.get(room["id"], {})
            if not getattr(self.settings, "room_worker_only", False) and room["state"] == "REVIEW" and old.get("state") != "REVIEW":
                for admin_id in self.settings.admin_ids:
                    self.alert_queue[(admin_id, room["id"])] = room
            if not getattr(self.settings, "room_worker_only", False) and room.get("partyId") and (old.get("generation") != room["generation"] or old.get("state") != room["state"]):
                for member in room["data"].get("roster", []) + old.get("data", {}).get("roster", []):
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
        try:
            await self.request("POST", f"/{room['id']}/release", self.lease_body(room))
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
        if event["kind"] == "presence":
            await self.request("POST", "/presence", value)
        elif event["kind"] in {"join", "review"}:
            room = await self.request("POST", f"/{found['id']}/claim")
            if not room:
                self.storage.retry_room_event(event["id"], time.time() + 1)
                return
            admission_started = False
            try:
                if event["kind"] == "review":
                    await self.report(room, "review", reason=value["reason"])
                else:
                    allowed = await self.request("POST", f"/{room['id']}/admission", {
                        "userId": value["userId"], "inviteLink": value["inviteLink"]})
                    if not allowed.get("allowed") or allowed.get("generation") != room["generation"]:
                        await self.mutate("decline_chat_join_request", int(room["chatId"]), int(value["userId"]))
                    else:
                        member = await self.bot.get_chat_member(int(room["chatId"]), int(value["userId"]), request_timeout=15)
                        if member.status == "kicked":
                            # Only lift a bot-owned removal; a moderator's ban needs manual review.
                            if value["userId"] not in room["data"].get("botBannedIds", []):
                                await self.mutate("decline_chat_join_request", int(room["chatId"]), int(value["userId"]))
                                self.storage.acknowledge_room_events([event["id"]])
                                return
                            await self.mutate("unban_chat_member", int(room["chatId"]), int(value["userId"]), only_if_banned=True)
                        await self.report(room, "admitting", userId=value["userId"])
                        admission_started = True
                        await self.mutate("approve_chat_join_request", int(room["chatId"]), int(value["userId"]))
                        check = await self.request("POST", f"/{room['id']}/admission", {
                            "userId": value["userId"], "inviteLink": value["inviteLink"]})
                        if not check.get("allowed") or check.get("generation") != room["generation"]:
                            await self.mutate("ban_chat_member", int(room["chatId"]), int(value["userId"]), revoke_messages=True)
                        else:
                            await self.mutate("restrict_chat_member", int(room["chatId"]), int(value["userId"]),
                                permissions=permissions(True), use_independent_chat_permissions=True)
                            await self.report(room, "joined", userId=value["userId"])
            except TelegramNetworkError:
                if admission_started:
                    await self.report(room, "review", reason="Telegram admission outcome uncertain; inspect participants")
                raise
            finally:
                await self.release(room)
        self.storage.acknowledge_room_events([event["id"]])

    async def revoke(self, room):
        for link in room["data"].get("links", []):
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
            member = await self.bot.get_chat_member(int(room["chatId"]), int(user_id), request_timeout=15)
            owned_ban = member.status != "kicked"
            purged_before = int(time.time())
            if owned_ban:
                try:
                    await self.mutate("ban_chat_member", int(room["chatId"]), int(user_id), revoke_messages=True)
                except TelegramBadRequest:
                    if member.status != "left":
                        raise
                    owned_ban = False
                member = await self.bot.get_chat_member(int(room["chatId"]), int(user_id), request_timeout=15)
            if member.status not in {"kicked", "left"}:
                raise ValueError("Participant removal not confirmed")
            await self.report(room, "member-removed", userId=user_id, ownedBan=owned_ban, purgedBefore=purged_before)

    async def delete_batch(self, room):
        batch = await self.request("POST", f"/{room['id']}/deletions", self.lease_body(room))
        if not batch:
            return False
        if any((datetime.now(UTC) - datetime.fromisoformat(item["sentAt"].replace("Z", "+00:00"))).total_seconds() >= 48 * 3600 for item in batch):
            raise ValueError("Messages older than Telegram deletion limit need manual cleanup")
        ids = [item["messageId"] for item in batch]
        success = await self.mutate("delete_messages", int(room["chatId"]), ids)
        if not success:
            raise ValueError("Message deletion not confirmed")
        await self.request("POST", f"/{room['id']}/deleted", {**self.lease_body(room), "messageIds": ids})
        return True

    async def restore_eligible_members(self, room):
        banned = set(room["data"].get("botBannedIds", []))
        for member in room["data"].get("roster", []):
            user_id = member.get("telegramId")
            if not user_id or user_id not in banned:
                continue
            check = await self.request("POST", f"/{room['id']}/eligible", {
                "userId": user_id, "generation": room["generation"], "inviteLink": ""})
            if not check.get("allowed"):
                continue
            await self.mutate("unban_chat_member", int(room["chatId"]), int(user_id), only_if_banned=True)
            await self.report(room, "member-unbanned", userId=user_id)

    async def update_card(self, room):
        card = await self.request("GET", f"/{room['id']}/card")
        if card.get("generation") != room["generation"]:
            raise ApiError("Party group changed", 409)
        members = card.get("members", [])
        text = f"🎮 <b>{escape(str(card.get('name') or 'Пати FDP'))}</b>\n"
        text += f"Состав: <b>{len(members)}/5</b> · Готовы: <b>{sum(bool(member.get('ready')) for member in members)}/{len(members)}</b>\n\n"
        for member in sorted(members, key=lambda item: item.get("role") or "9"):
            name = escape(member["name"][:50])
            role = escape(member.get("role") or "—")
            text += f"{'✅' if member.get('ready') else '❌'} {role} · <b>{name}</b>"
            if member.get("mmr"):
                text += " · " + escape(str(member["mmr"])) + " MMR"
            text += "\nDota ID: " + escape(str(member.get("dotaAccountId") or "не указан")) + "\n"
        text += "\nПоздоровайтесь и договоритесь об игре.\nЧат временный: после завершения пати переписка удаляется."
        row = [InlineKeyboardButton(text="✅ Готов играть", callback_data=f"roomready:{room['id']}:{room['generation']}")]
        if card.get("discordUrl"):
            row.append(InlineKeyboardButton(text="🔊 Discord", url=card["discordUrl"]))
        markup = InlineKeyboardMarkup(inline_keyboard=[row])
        message_id = room["data"].get("cardId")
        if message_id:
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
            await self.report(room, "card", messageId=message_id)
            await self.mutate("pin_chat_message", int(room["chatId"]), message_id, disable_notification=True)
        await self.report(room, "card", messageId=message_id)

    async def operate(self, room):
        chat_id = int(room["chatId"])
        if room["state"] != "ACTIVE" or time.time() - self.validated_at.get(room["id"], 0) >= 120:
            _, staff = await self.validate_group(chat_id)
            if set(staff) != set(room["data"].get("staffIds", [])):
                raise ValueError("Administrator list changed; manual review required")
            self.validated_at[room["id"]] = time.time()
        if room["state"] in {"PREPARING", "ROTATING", "CLOSING"}:
            await self.mutate("set_chat_permissions", chat_id, permissions(False), use_independent_chat_permissions=True)
            await self.revoke(room)
            while await self.flush_messages():
                pass
            await self.remove_members(room)
        if room["state"] == "CLOSING":
            while await self.flush_messages():
                pass
            if await self.delete_batch(room):
                return
            for user_id in list(room["data"].get("botBannedIds", [])):
                await self.mutate("unban_chat_member", chat_id, int(user_id), only_if_banned=True)
                await self.report(room, "member-unbanned", userId=user_id)
            admins = await self.bot.get_chat_administrators(chat_id, return_bots=True, request_timeout=15)
            if await self.bot.get_chat_member_count(chat_id, request_timeout=15) != len(admins):
                raise ValueError("Untracked participants remain in the group")
            await self.mutate("set_chat_title", chat_id, room["title"])
            await self.report(room, "closed")
            return
        if room["state"] == "PREPARING":
            while await self.flush_messages():
                pass
            if await self.delete_batch(room):
                return
            await self.mutate("set_chat_title", chat_id, ("FDP · " + room["data"].get("partyName", "Пати"))[:128])
        if room["state"] in {"PREPARING", "ROTATING"}:
            await self.restore_eligible_members(room)
            if not room["data"].get("cardId") or room["data"].get("cardDirty"):
                await self.update_card(room)
            expiry = datetime.fromisoformat(room["data"]["expiresAt"].replace("Z", "+00:00"))
            if expiry <= datetime.now(UTC):
                await self.report(room, "retry", retrySeconds=30)
                return
            invite = await self.mutate("create_chat_invite_link", chat_id, creates_join_request=True,
                expire_date=expiry, name=f"FDP {room['generation']}")
            try:
                await self.mutate("set_chat_permissions", chat_id, permissions(True), use_independent_chat_permissions=True)
                await self.report(room, "prepared" if room["state"] == "PREPARING" else "rotated", inviteLink=invite.invite_link)
            except Exception:
                await self.mutate("revoke_chat_invite_link", chat_id, invite.invite_link)
                raise
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
            if room["data"].get("cardDirty") or time.time() >= self.maintenance_after.get(room["id"], 0):
                await self.update_card(room)
            await self.delete_batch(room)
            self.maintenance_after[room["id"]] = time.time() + 60

    async def refresh_hint(self, user_id, party_id, room):
        fresh = await self.for_user(user_id, room["data"]["partySlug"])
        key = "party_room_hint:" + party_id
        old = self.storage.get_choice(user_id, key, 0)
        ready_key = "party_room_ready_link:" + party_id
        ready_link = self.storage.get_choice(user_id, ready_key, 0)
        if not fresh or not fresh.get("inviteLink") or fresh.get("partyId") != party_id:
            for saved in (old, ready_link):
                if isinstance(saved, dict) and saved.get("messageId"):
                    self.storage.add_temporary_message(user_id, user_id, saved["messageId"], 1)
            self.storage.set_choices(user_id, key, [])
            self.storage.set_choices(user_id, ready_key, [])
            await self.refresh_private_controls(user_id, party_id)
            return
        if isinstance(old, dict) and old.get("url") == fresh["inviteLink"]:
            return
        markup = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="💬 Открыть чат пати", url=fresh["inviteLink"])]])
        if isinstance(ready_link, dict) and ready_link.get("url") != fresh["inviteLink"]:
            try:
                await self.bot.edit_message_reply_markup(chat_id=user_id, message_id=ready_link["messageId"], reply_markup=markup)
                ready_link["url"] = fresh["inviteLink"]
                self.storage.set_choices(user_id, ready_key, [ready_link])
            except TelegramBadRequest:
                self.storage.set_choices(user_id, ready_key, [])
        text = "💬 <b>Чат пати в Telegram</b>\n\n" + escape(room["data"].get("partyName", "Пати")) + "\nОткрой чат, вступи и поздоровайся с игроками."
        message_id = old.get("messageId") if isinstance(old, dict) else None
        if message_id:
            try:
                await self.bot.edit_message_text(text, chat_id=user_id, message_id=message_id, parse_mode="HTML", reply_markup=markup)
            except TelegramBadRequest:
                message_id = None
        if not message_id:
            message = await self.bot.send_message(user_id, text, parse_mode="HTML", reply_markup=markup)
            message_id = message.message_id
        self.storage.set_choices(user_id, key, [{"messageId": message_id, "url": fresh["inviteLink"], "generation": fresh["generation"]}])
        expiry = datetime.fromisoformat(room["data"]["expiresAt"].replace("Z", "+00:00"))
        self.storage.add_temporary_message(user_id, user_id, message_id, max(1, min(47 * 3600, int((expiry - datetime.now(UTC)).total_seconds()))))
        await self.refresh_private_controls(user_id, party_id)

    async def refresh_private_controls(self, user_id, party_id):
        panel = self.storage.get_panel(user_id)
        panel_context = self.storage.get_choice(user_id, "party_room_panel", 0)
        if panel and panel.screen == "party" and isinstance(panel_context, dict) and panel_context.get("partyId") == party_id:
            from .panel import edit_panel
            await edit_panel(self.bot, self.storage, self.api, self.settings, user_id, "party")
        from .party_ready import _links, refresh_ready_notice
        for notice in self.storage.party_ready_notices():
            if notice["userId"] == user_id and notice["partyId"] == party_id:
                _links.pop((user_id, notice["token"]), None)
                await refresh_ready_notice(self.bot, self.api, self.settings, self.storage, notice)

    async def send_admin_alert(self, user_id, room):
        key = "party_room_alert:" + room["id"]
        old = self.storage.get_choice(user_id, key, 0)
        if isinstance(old, dict) and old.get("generation") == room["generation"]:
            return
        text = "⚠️ <b>Нужна проверка чата пати</b>\n\n" + escape(room["title"]) + "\nГруппа исключена из новых выдач до проверки."
        await self.bot.send_message(user_id, text, parse_mode="HTML", reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="Проверить группу", callback_data=f"roomadmin:view:{room['id']}")]]))
        self.storage.set_choices(user_id, key, [{"generation": room["generation"]}])

    async def worker(self):
        if not self.enabled:
            return
        cursor = 0
        while True:
            try:
                if time.time() >= self.sync_after:
                    await self.sync()
                    self.sync_after = time.time() + 5
                await self.flush_messages()
                for event in self.storage.pending_room_events(self.bot.id, 10):
                    if event["kind"] == "message":
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
                jobs = [room for room in self.by_chat.values() if room.get("state") not in {"FREE", "REVIEW", None}
                    and (room["state"] != "ACTIVE" or room["data"].get("cardDirty") or room["data"].get("evictIds")
                         or time.time() >= self.maintenance_after.get(room["id"], 0)
                         or any(self.expiry_cache.get((room["id"], link["url"])) != room["data"].get("expiresAt")
                                for link in room["data"].get("links", []) if not link["revoked"]))]
                if jobs:
                    candidate = jobs[cursor % len(jobs)]
                    cursor += 1
                    room = await self.request("POST", f"/{candidate['id']}/claim")
                    if room:
                        try:
                            await self.operate(room)
                        except TelegramRetryAfter as error:
                            await self.report(room, "retry", retrySeconds=error.retry_after + 1)
                        except ApiError as error:
                            if error.status != 409:
                                logger.warning("Party group API operation failed; will retry")
                        except TelegramNetworkError:
                            # An ambiguous write must be inspected before group reuse.
                            await self.report(room, "review", reason="Telegram transport outcome uncertain")
                        except (TelegramAPIError, ValueError):
                            await self.report(room, "review", reason="Telegram group operation failed; check permissions and cleanup")
                        finally:
                            await self.release(room)
                        if room.get("state") != candidate.get("state") or room.get("generation") != candidate.get("generation"):
                            self.sync_after = 0
                eligible_alert = next((key for key in self.alert_queue if self.private_after.get(key[0], 0) <= time.time()), None)
                eligible_hint = next((key for key in self.hint_queue if self.private_after.get(key[0], 0) <= time.time()), None)
                if not getattr(self.settings, "room_worker_only", False) and time.time() >= self.next_hint and (eligible_alert or eligible_hint):
                    try:
                        if eligible_alert:
                            user_id = eligible_alert[0]
                            await self.send_admin_alert(user_id, self.alert_queue.pop(eligible_alert))
                        else:
                            user_id, party_id = eligible_hint
                            await self.refresh_hint(user_id, party_id, self.hint_queue.pop(eligible_hint))
                    except (ApiError, TelegramAPIError):
                        logger.warning("Could not refresh private Telegram group invitation")
                    self.private_after[user_id] = time.time() + 1.1
                    self.next_hint = time.time() + .5
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
