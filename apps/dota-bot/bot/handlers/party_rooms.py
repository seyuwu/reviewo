from collections import Counter
from html import escape
import secrets
import time
import logging
from urllib.parse import urlencode
from uuid import UUID

from aiogram import F, Router
from aiogram.exceptions import TelegramAPIError
from aiogram.filters import Command, CommandStart
from aiogram.filters.command import CommandObject
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import (CallbackQuery, ChatAdministratorRights, InlineKeyboardButton, InlineKeyboardMarkup,
    KeyboardButton, KeyboardButtonRequestChat, Message, ReplyKeyboardMarkup, ReplyKeyboardRemove)

from ..api.client import ApiError
from ..services.callbacks import acknowledge_callback
from ..services.panel import edit_panel, edit_panel_content
from ..services.party_coordination import own_member, read_coordination
from ..services.party_discord import SendPartyDiscordMessage, EditPartyDiscordMessage
from ..services.party_room_review import review_details
from ..services.temporary_notifications import send_temporary_notification
from ..ui.keyboards import button

router = Router(name="party-rooms")
logger = logging.getLogger(__name__)
STATES = {"FREE": "Свободна", "PREPARING": "Подготовка", "ACTIVE": "Занята", "ROTATING": "Смена приглашения", "CLOSING": "Очистка", "REVIEW": "Требует проверки"}


class RoomSettings(StatesGroup):
    choosing_group = State()
    capacity = State()


@router.message(CommandStart(deep_link=True), F.text.regexp(r"^/start(?:@\w+)?\s+manage_[a-f0-9]{32}$"))
async def open_party_management(message: Message, command: CommandObject, state: FSMContext, api, settings, storage):
    if message.chat.type != "private" or message.from_user is None:
        return
    user_id = message.from_user.id
    party_id = str(UUID((command.args or "").removeprefix("manage_")))
    storage.record_bot_user(user_id, display_name=message.from_user.full_name, username=message.from_user.username)
    try:
        if storage.get_session(user_id) is None:
            auth = await api.login_telegram_bot_session(user_id)
            storage.save_session(user_id, auth["accessToken"], auth["refreshToken"], clear_recovery_url=True)
        response = await api.user(user_id, "GET", "/social/parties/me")
        party = response.get("party") or ((response.get("parties") or [None])[-1])
        if not party or party.get("id") != party_id or party.get("kind") != "PARTY" or not party.get("isMember"):
            await message.answer("Эта пати завершилась или ты больше в ней не состоишь. Открой свою пати в меню FDP.")
            return
        await state.clear()
        storage.set_choices(user_id, "pending_onboarding_action", [])
        storage.set_choices(user_id, "pending_solo_search", [])
        await edit_panel(message.bot, storage, api, settings, user_id, "party", message.chat.id,
                         force_new_message=storage.get_panel(user_id) is not None)
    except ApiError:
        await message.answer("Не получилось открыть пати. Попробуй ещё раз или открой /start.")


@router.message(CommandStart(deep_link=True), F.text.regexp(r"^/start(?:@\w+)?\s+dotaid_[a-f0-9]{32}$"))
async def open_party_dota_id(message: Message, command: CommandObject, state: FSMContext, api, settings, storage):
    if message.chat.type != "private" or message.from_user is None:
        return
    user_id = message.from_user.id
    storage.record_bot_user(user_id, display_name=message.from_user.full_name, username=message.from_user.username)
    party_id = str(UUID((command.args or "").removeprefix("dotaid_")))
    try:
        auth = await api.login_telegram_bot_session(user_id)
        storage.save_session(user_id, auth["accessToken"], auth["refreshToken"], clear_recovery_url=True)
        response = await api.user(user_id, "GET", "/social/parties/me")
        parties = list(response.get("parties") or [])
        if response.get("party"):
            parties.append(response["party"])
        if not any(party.get("id") == party_id and party.get("kind") == "PARTY" and party.get("isMember") for party in parties):
            await message.answer("Эта пати завершилась или ты больше в ней не состоишь. Открой свою пати в меню FDP.")
            return
        from .registration import start_standalone_dota_id
        await start_standalone_dota_id(message.bot, state, api, settings, storage, user_id, message.chat.id,
            return_screen="party", required_for_ready=True)
    except ApiError:
        await message.answer("Не получилось открыть Dota ID. Попробуй ещё раз через «Аккаунт» в FDP.")


@router.callback_query(F.data.regexp(r"^roomping:[a-f0-9-]{36}:\d+$"))
async def group_ping_menu(callback: CallbackQuery, api, settings, storage):
    if callback.message is None or callback.message.chat.type != "supergroup":
        await callback.answer("Открой список из чата своей пати.", show_alert=True)
        return
    _, room_id, generation = callback.data.split(":")
    pool = api.party_rooms
    room = pool.by_chat.get(callback.message.chat.id) if pool else None
    if not room or room["id"] != room_id:
        await callback.answer("Кнопка устарела. Открой текущую карточку пати.", show_alert=True)
        return
    now = time.time()
    key = (callback.from_user.id, room_id)
    requests = [stamp for stamp in pool.ping_chat_requests.get(callback.message.chat.id, []) if stamp > now - 60]
    if pool.ping_cooldowns.get(key, 0) > now or len(requests) >= 5:
        await callback.answer("Подожди немного и попробуй снова.")
        return
    pool.ping_cooldowns[key] = now + 5
    pool.ping_chat_requests[callback.message.chat.id] = requests + [now]
    acknowledge_callback(callback, "Открываю игроков…")
    try:
        result = await pool.request("POST", f"/{room_id}/ping-targets", {"userId": str(callback.from_user.id), "generation": int(generation)})
        choices = [{"token": secrets.token_hex(10), "roomId": room_id, "generation": int(generation),
                    "chatId": callback.message.chat.id, "targetMembershipId": target["membershipId"], "expiresAt": now + 120,
                    "name": str(target.get("name") or "Игрок")[:40], "inChat": bool(target.get("inChat"))}
                   for target in result.get("targets", [])[:4]]
        storage.set_choices(callback.from_user.id, "room_ping_choices", choices)
        rows = [[button(("💬 " if choice["inChat"] else "🔔 ") + choice["name"], "roomping:pick:" + choice["token"])] for choice in choices]
        text = ("<b>Кого позвать в чат?</b>\n\nВыбери игрока — FDP пришлёт ему личное уведомление с кнопкой чата.\n"
                "💬 — уже состоит в чате. Повторный вызов: раз в 5 минут." if choices
                else "В пати пока нет других игроков, которые подключили бота FDP.")
        await pool.mutate(SendPartyDiscordMessage(chat_id=callback.message.chat.id, text=text,
            reply_markup=InlineKeyboardMarkup(inline_keyboard=rows) if rows else None,
            ephemeral_message_parameters={"receiver_user_id": callback.from_user.id, "callback_query_id": callback.id}))
    except ApiError as error:
        await callback.answer(str(error) if error.status in {400, 403, 409, 429} else "Не удалось открыть список. Попробуй ещё раз.", show_alert=True)
    except TelegramAPIError:
        await callback.answer("Не удалось показать список. Открой «Управлять пати» и карточку игрока.", show_alert=True)


@router.callback_query(F.data.regexp(r"^roomping:pick:[a-f0-9]{20}$"))
async def group_ping_player(callback: CallbackQuery, api, settings, storage):
    if callback.message is None or callback.message.chat.type != "supergroup":
        await callback.answer("Открой список из чата своей пати.", show_alert=True)
        return
    token = callback.data.rsplit(":", 1)[-1]
    choices = [storage.get_choice(callback.from_user.id, "room_ping_choices", index) for index in range(4)]
    choice = next((item for item in choices if isinstance(item, dict) and item.get("token") == token), None)
    if not choice or choice.get("chatId") != callback.message.chat.id or choice.get("expiresAt", 0) <= time.time():
        await callback.answer("Список устарел. Нажми «Позвать в чат» заново.", show_alert=True)
        return
    pool = api.party_rooms
    room = pool.by_chat.get(callback.message.chat.id) if pool else None
    if not room or room["id"] != choice["roomId"]:
        await callback.answer("Пати изменилась. Открой текущую карточку.", show_alert=True)
        return
    try:
        await pool.request("POST", f"/{choice['roomId']}/ping", {"userId": str(callback.from_user.id),
            "generation": choice["generation"], "targetMembershipId": choice["targetMembershipId"]})
        await callback.answer("🔔 Позвал игрока — FDP отправит кнопку чата.")
        ephemeral_id = callback.message.model_dump().get("ephemeral_message_id")
        if ephemeral_id:
            try:
                await pool.mutate(EditPartyDiscordMessage(chat_id=callback.message.chat.id, receiver_user_id=callback.from_user.id,
                    ephemeral_message_id=ephemeral_id, text="🔔 <b>Игрок приглашён в чат</b>\nFDP отправит ему личное уведомление."))
            except TelegramAPIError:
                pass
    except ApiError as error:
        await callback.answer(str(error) if error.status in {400, 403, 409, 429} else "Не получилось позвать игрока. Попробуй ещё раз.", show_alert=True)


def authorized(event, settings):
    message = event.message if isinstance(event, CallbackQuery) else event
    return (event.from_user is not None and event.from_user.id in settings.admin_ids
            and message is not None and message.chat.type == "private" and message.chat.id == event.from_user.id)


async def admin_snapshot(api, bot, user_id):
    return await api.rooms_request("GET", "/admin?" + urlencode({"botId": str(bot.id), "adminId": str(user_id)}))


async def show_rooms(bot, api, settings, storage, user_id, chat_id, page=0, notice=""):
    snapshot = await admin_snapshot(api, bot, user_id)
    rooms = snapshot["rooms"]
    counts = Counter(room["state"] for room in rooms)
    used = sum(counts[key] for key in ("PREPARING", "ACTIVE", "ROTATING"))
    free = sum(room["state"] == "FREE" and room["enabled"] for room in rooms)
    text = ("<b>Группы пати FDP</b>\n\n"
            f"Подключено: <b>{len(rooms)}</b> · рабочий лимит: <b>{snapshot['capacity']}</b>\n"
            f"Выдано: <b>{used}</b> · свободных: <b>{free}</b>\n"
            f"Очистка: <b>{counts['CLOSING']}</b> · требуют проверки: <b>{counts['REVIEW']}</b>\n\n"
            "Лимит ограничивает новые выдачи. Отключение занятой группы вступит в силу после завершения пати.")
    if notice:
        text = escape(notice) + "\n\n" + text
    page = max(0, min(page, max(0, (len(rooms) - 1) // 6)))
    rows = [[button("➕ Добавить группу", "roomadmin:add"), button(f"✏️ Лимит: {snapshot['capacity']}", "roomadmin:capacity")],
            [button("Подключить несколько групп", "roomadmin:bulk")]]
    for room in rooms[page * 6:page * 6 + 6]:
        label = room.get("partyName") or room["title"]
        rows.append([button(f"{'⏸ ' if not room['enabled'] else ''}{label[:25]} · {STATES[room['state']]}", f"roomadmin:view:{room['id']}")])
    navigation = []
    if page > 0:
        navigation.append(button("←", f"roomadmin:list:{page-1}"))
    if (page + 1) * 6 < len(rooms):
        navigation.append(button("→", f"roomadmin:list:{page+1}"))
    if navigation:
        rows.append(navigation)
    rows.append([button("🔄 Обновить", f"roomadmin:list:{page}"), button("← Админка", "admin:refresh")])
    await edit_panel_content(bot, storage, api, settings, user_id, "admin:rooms", text, InlineKeyboardMarkup(inline_keyboard=rows), chat_id)


@router.callback_query(F.data.startswith("roomadmin:"))
async def room_admin_action(callback: CallbackQuery, state: FSMContext, api, settings, storage):
    if not authorized(callback, settings):
        await callback.answer("Нет доступа", show_alert=True)
        return
    acknowledge_callback(callback)
    user_id = callback.from_user.id
    parts = callback.data.split(":")
    action = parts[1]
    try:
        if action == "bulk":
            await state.clear()
            await callback.message.answer("Перешли следующее сообщение в свои новые пустые группы. "
                "В обычном окне пересылки Telegram можно выбрать несколько групп сразу. "
                "FDP проверит владельца и права, а результат пришлёт сюда.")
            await callback.message.answer("/fdpchat")
        elif action == "add":
            await state.set_state(RoomSettings.choosing_group)
            request_id = secrets.randbelow(2**30) + 1
            storage.set_choices(user_id, "party_room_registration", [{"requestId": request_id, "expiresAt": time.time() + 300}])
            rights = ChatAdministratorRights(is_anonymous=False, can_manage_chat=True, can_delete_messages=True,
                can_manage_video_chats=False, can_restrict_members=True, can_promote_members=False,
                can_change_info=True, can_invite_users=True, can_post_stories=False, can_edit_stories=False,
                can_delete_stories=False, can_pin_messages=True)
            keyboard = ReplyKeyboardMarkup(keyboard=[[KeyboardButton(text="Выбрать приватную группу", request_chat=KeyboardButtonRequestChat(
                request_id=request_id, chat_is_channel=False, chat_has_username=False, chat_is_created=True,
                bot_is_member=True, bot_administrator_rights=rights, user_administrator_rights=rights,
                request_title=True))]], resize_keyboard=True, one_time_keyboard=True)
            await callback.message.answer("Выбери новую пустую приватную группу, где FDP уже администратор. "
                "Оставь внутри только администрацию и бота. Игрокам доступ будет выдавать FDP через свои приглашения.", reply_markup=keyboard)
        elif action == "capacity":
            await state.set_state(RoomSettings.capacity)
            await edit_panel_content(callback.bot, storage, api, settings, user_id, "admin:rooms:capacity",
                "<b>Рабочий лимит групп</b>\n\nОтправь число от 0 до 500.\n0 приостанавливает новые выдачи; существующие чаты продолжают работать.",
                InlineKeyboardMarkup(inline_keyboard=[[button("← Назад", "roomadmin:list:0")]]), user_id)
        elif action == "list":
            await state.clear()
            await show_rooms(callback.bot, api, settings, storage, user_id, user_id, int(parts[2]) if len(parts) > 2 else 0)
        elif action == "view":
            await state.clear()
            if callback.message and callback.message.chat.id == user_id and (callback.message.text or "").startswith("⚠️ Нужна проверка чата пати"):
                # Older alerts did not retain message IDs; learn them from an admin's click.
                storage.track_room_admin_alert(user_id, parts[2], user_id, callback.message.message_id)
            snapshot = await admin_snapshot(api, callback.bot, user_id)
            room = next((room for room in snapshot["rooms"] if room["id"] == parts[2]), None)
            if not room or room["state"] not in {"REVIEW", "CLOSING"}:
                api.party_rooms.resolve_admin_alerts(parts[2])
            if not room:
                await show_rooms(callback.bot, api, settings, storage, user_id, user_id, notice="Группа уже удалена из списка.")
                return
            text = f"<b>{escape(room.get('partyName') or room['title'])}</b>\n\nСостояние: {STATES[room['state']]}\nВыдача: {'включена' if room['enabled'] else 'отключена'}"
            if room["removeWhenFree"]:
                text += "\nУдаление из списка после завершения пати."
            if room.get("error"):
                details = review_details(room)
                text += "\n\n<b>" + escape(details["reason"]) + "</b>\n" + escape(details["action"])
                if details["manualRequired"]:
                    text += "\n\nРучную очистку подтверждает владелец группы."
            rows = []
            if room.get("inviteLink"):
                rows.append([InlineKeyboardButton(text="💬 Открыть группу", url=room["inviteLink"])])
            else:
                rows.append([InlineKeyboardButton(text="💬 Открыть группу", url=f"https://t.me/c/{room['chatId'][4:]}/1")])
            toggle = "disable" if room["enabled"] else "enable"
            rows.append([button("⏸ Исключить из выдачи" if room["enabled"] else "▶️ Включить выдачу", f"roomadmin:do:{room['id']}:{toggle}")])
            rows.append([button("🗑 Удалить из списка", f"roomadmin:confirm:{room['id']}:remove")])
            if room["state"] == "REVIEW":
                rows.append([button(review_details(room)["retryLabel"], f"roomadmin:confirm:{room['id']}:retry")])
                rows.append([button("Подтвердить ручную очистку", f"roomadmin:confirm:{room['id']}:manual")])
            rows.append([button("← Все группы", "roomadmin:list:0")])
            await edit_panel_content(callback.bot, storage, api, settings, user_id, "admin:rooms:group", text, InlineKeyboardMarkup(inline_keyboard=rows), user_id)
        elif action == "confirm":
            target = parts[3]
            text = ("Удалить группу из списка FDP? Занятая группа будет отключена от новых выдач и удалена из списка после завершения и очистки. Сама Telegram-группа останется."
                    if target == "remove" else "Вручную очисти историю группы ДЛЯ ВСЕХ и оставь только администрацию и бота. Подтверждение освободит текущий чат пати. Продолжить?"
                    if target == "manual" else "Повторить очистку? Участники текущего чата будут удалены, переписка очищена.")
            await edit_panel_content(callback.bot, storage, api, settings, user_id, "admin:rooms:confirm", text,
                InlineKeyboardMarkup(inline_keyboard=[[button("Подтверждаю", f"roomadmin:do:{parts[2]}:{target}"), button("Отмена", f"roomadmin:view:{parts[2]}")]]), user_id)
        elif action == "do":
            target = parts[3]
            payload = {"botId": str(callback.bot.id), "adminId": str(user_id), "action": target}
            if target == "manual":
                pool = api.party_rooms
                room = await pool.request("POST", f"/{parts[2]}/claim")
                if not room:
                    await callback.message.answer("Группа сейчас обрабатывается. Попробуй через несколько секунд.")
                    return
                try:
                    _, staff = await pool.validate_group(int(room["chatId"]), owner_id=user_id)
                    await pool.revoke(room)
                    for player in list(room["data"].get("presentIds", [])):
                        if player not in room["data"].get("staffIds", []):
                            member = await callback.bot.get_chat_member(int(room["chatId"]), int(player))
                            if member.status not in {"left", "kicked"}:
                                raise ValueError("В группе остались игроки.")
                            await pool.report(room, "member-removed", userId=player, ownedBan=False)
                    while await pool.flush_messages():
                        pass
                    payload.update(action="confirm-clean", staffIds=staff)
                finally:
                    await pool.release(room)
            result = await api.rooms_request("POST", f"/admin/{parts[2]}", payload)
            if isinstance(result, dict) and result.get("state") == "FREE":
                api.party_rooms.resolve_admin_alerts(parts[2])
            await show_rooms(callback.bot, api, settings, storage, user_id, user_id, notice="Сохранено.")
            api.party_rooms.sync_after = 0
            api.party_rooms.wakeup.set()
    except ValueError as error:
        await callback.message.answer(str(error))
    except ApiError:
        await callback.message.answer("Не получилось обновить группы. Попробуй ещё раз.")


@router.message(F.chat_shared)
async def register_selected_room(message: Message, state: FSMContext, api, settings, storage):
    if not authorized(message, settings):
        return
    saved = storage.get_choice(message.from_user.id, "party_room_registration", 0)
    shared = message.chat_shared
    if not isinstance(saved, dict) or saved["expiresAt"] < time.time() or saved["requestId"] != shared.request_id:
        await message.answer("Выбор группы устарел. Нажми «Добавить группу» заново.", reply_markup=ReplyKeyboardRemove())
        await state.clear()
        return
    try:
        pool = api.party_rooms
        chat, staff = await pool.validate_group(shared.chat_id, owner_id=message.from_user.id)
        await api.rooms_request("POST", "/admin/register", {"botId": str(message.bot.id), "adminId": str(message.from_user.id),
            "chatId": str(chat.id), "title": chat.title, "staffIds": staff})
        await pool.sync()
        pool.wakeup.set()
        storage.set_choices(message.from_user.id, "party_room_registration", [])
        await state.clear()
        await message.answer("Группа подключена.", reply_markup=ReplyKeyboardRemove())
        await show_rooms(message.bot, api, settings, storage, message.from_user.id, message.chat.id)
    except ValueError as error:
        await message.answer(str(error), reply_markup=ReplyKeyboardRemove())
        await state.clear()
    except Exception:
        # Do not expose invite URLs or transport exception chains in Telegram.
        await message.answer("Не удалось подключить группу. Проверь права FDP и попробуй ещё раз.", reply_markup=ReplyKeyboardRemove())
        await state.clear()


@router.message(RoomSettings.capacity, F.text)
async def change_room_capacity(message: Message, state: FSMContext, api, settings, storage):
    if not authorized(message, settings):
        return
    try:
        value = int(message.text.strip())
        if not 0 <= value <= 500:
            raise ValueError()
    except ValueError:
        await message.answer("Нужно целое число от 0 до 500.")
        return
    try:
        await api.rooms_request("POST", "/admin/capacity", {"botId": str(message.bot.id), "adminId": str(message.from_user.id), "capacity": value})
        await state.clear()
        await show_rooms(message.bot, api, settings, storage, message.from_user.id, message.chat.id, notice="Лимит сохранён.")
    except ApiError:
        await message.answer("Не удалось сохранить лимит. Попробуй ещё раз.")


@router.callback_query(F.data.regexp(r"^roomready:[a-f0-9-]{36}:\d+$"))
async def group_ready(callback: CallbackQuery, api, settings, storage):
    if callback.message is None or callback.message.chat.type != "supergroup":
        await callback.answer("Открой текущую карточку в чате пати.", show_alert=True)
        return
    _, room_id, generation = callback.data.split(":")
    room = api.party_rooms.by_chat.get(callback.message.chat.id)
    if not room or room["id"] != room_id:
        await callback.answer("Кнопка устарела.", show_alert=True)
        return
    cooldown = (callback.from_user.id, room_id)
    if api.party_rooms.ready_cooldowns.get(cooldown, 0) > time.time():
        await callback.answer("Уже подтверждаем готовность.")
        return
    api.party_rooms.ready_cooldowns[cooldown] = time.time() + 2
    try:
        await api.party_rooms.request("POST", f"/{room_id}/ready", {"userId": str(callback.from_user.id),
            "generation": int(generation), "ready": True, "inviteLink": ""})
        await callback.answer("Готовность подтверждена ✅")
        api.party_rooms.sync_after = 0
        api.party_rooms.wakeup.set()
    except ApiError as error:
        if error.status == 400 and "Dota ID" in str(error):
            await callback.answer("Сначала укажи Dota ID — по нему команда пригласит тебя в игру.", show_alert=True)
            url = f"https://t.me/{getattr(settings, 'main_bot_username', 'FDPdotabot')}?start=dotaid_{UUID(room['partyId']).hex}"
            try:
                await api.party_rooms.mutate(SendPartyDiscordMessage(chat_id=callback.message.chat.id,
                    text="🎮 <b>Укажи свой Dota ID</b>\n\nКоманда сможет пригласить тебя в игру. Затем нажми «Готов играть».",
                    reply_markup=InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="🎮 Указать Dota ID", url=url)]]),
                    ephemeral_message_parameters={"receiver_user_id": callback.from_user.id, "callback_query_id": callback.id}))
            except TelegramAPIError:
                pass  # The pinned card also contains the permanent ID entry button.
        else:
            await callback.answer("Состав изменился. Открой текущую карточку пати.", show_alert=True)


@router.callback_query(F.data.regexp(r"^roomdiscord:[a-f0-9-]{36}:\d+$"))
async def group_discord(callback: CallbackQuery, api, settings, storage):
    if callback.message is None or callback.message.chat.type != "supergroup":
        await callback.answer("Открой Discord из текущего чата пати.", show_alert=True)
        return
    _, room_id, generation = callback.data.split(":")
    pool = api.party_rooms
    room = pool.by_chat.get(callback.message.chat.id)
    if not room or room["id"] != room_id:
        await callback.answer("Кнопка устарела.", show_alert=True)
        return
    if not any(str(member.get("telegramId")) == str(callback.from_user.id) for member in room.get("data", {}).get("roster", [])):
        await callback.answer("Discord доступен участникам этой пати.", show_alert=True)
        return
    key = (callback.from_user.id, room_id)
    if pool.discord_cooldowns.get(key, 0) > time.time():
        await callback.answer("Подожди немного — уже готовим Discord.")
        return
    requests = [stamp for stamp in pool.discord_chat_requests.get(callback.message.chat.id, []) if stamp > time.time() - 60]
    if len(requests) >= 5:
        await callback.answer("Discord сейчас занят. Попробуй через минуту.", show_alert=True)
        return
    pool.discord_chat_requests[callback.message.chat.id] = requests + [time.time()]
    pool.discord_cooldowns[key] = time.time() + 10
    acknowledge_callback(callback, "Готовлю Discord…")
    ephemeral_id = None
    try:
        status = await pool.mutate(SendPartyDiscordMessage(chat_id=callback.message.chat.id,
            text="🔊 Готовлю войс Discord…", ephemeral_message_parameters={
                "receiver_user_id": callback.from_user.id, "callback_query_id": callback.id}))
        ephemeral_id = status.model_dump().get("ephemeral_message_id")
    except TelegramAPIError:
        logger.warning("Could not show private Discord preparation status")
    try:
        voice = await pool.request("POST", f"/{room_id}/discord", {
            "userId": str(callback.from_user.id), "generation": int(generation)})
        text = f"🔊 <b>{escape(voice['name'])}</b>\nЛимит войса: <b>{voice['limit']} чел.</b>\nПривязывать Discord к FDP не нужно."
        markup = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="🔊 Перейти в Discord", url=voice["inviteUrl"])]])
    except ApiError:
        text = "Не получилось подготовить Discord. Проверь, что пати ещё активна, и попробуй кнопку снова."
        markup = None
    try:
        if ephemeral_id:
            await pool.mutate(EditPartyDiscordMessage(chat_id=callback.message.chat.id, receiver_user_id=callback.from_user.id,
                ephemeral_message_id=ephemeral_id, text=text, reply_markup=markup))
        else:
            await pool.mutate(SendPartyDiscordMessage(chat_id=callback.message.chat.id, text=text, reply_markup=markup,
                ephemeral_message_parameters={"receiver_user_id": callback.from_user.id}))
    except TelegramAPIError:
        pool.discord_cooldowns[key] = time.time() + 2
        logger.warning("Could not deliver private Discord invitation; click can be retried")


@router.callback_query(F.data.regexp(r"^roomopen:[a-f0-9]{20}$"))
async def open_party_group(callback: CallbackQuery, api, settings, storage):
    if callback.message is None or callback.message.chat.type != "private" or callback.message.chat.id != callback.from_user.id:
        acknowledge_callback(callback)
        return
    context = storage.get_choice(callback.from_user.id, "party_coordination_token:" + callback.data.split(":")[1], 0)
    if not isinstance(context, dict):
        await callback.answer("Открой свою пати заново.", show_alert=True)
        return
    if not api.party_rooms or not api.party_rooms.enabled:
        await callback.answer("Telegram-чат сейчас недоступен. Попробуй позже.", show_alert=True)
        return
    acknowledge_callback(callback, "Подготавливаем чат…")
    try:
        coordination = await read_coordination(api, callback.from_user.id, context["partySlug"])
        member = own_member(coordination)
        if coordination["id"] != context["partyId"] or not member or member["membershipId"] != context["membershipId"]:
            raise ApiError("Состав пати изменился", 409)
        room = await api.party_rooms.request("POST", "/reserve", {"userId": str(callback.from_user.id), "slug": context["partySlug"]})
        api.party_rooms.sync_after = 0
        api.party_rooms.wakeup.set()
        await edit_panel(callback.bot, storage, api, settings, callback.from_user.id, "party")
        if room and room.get("inviteLink"):
            text = "Чат готов — нажми «Чат пати в Telegram» в окне пати."
        elif room and room["state"] in {"PREPARING", "ROTATING"}:
            text = "Готовлю чат в Telegram. Кнопка перехода появится в окне пати после подготовки."
        else:
            text = "Telegram-чат пока недоступен. Попробуй открыть его чуть позже."
    except ApiError as error:
        text = ("Не удалось подтвердить связь Telegram с этой пати. Открой «Аккаунт» и проверь привязку."
                if error.status == 403 else "Не удалось открыть Telegram-чат. Открой пати заново и попробуй ещё раз.")
    await send_temporary_notification(callback.bot, storage, callback.from_user.id,
                                      callback.message.chat.id, text, 10)


@router.callback_query(F.data == "roomopen:unavailable")
async def unavailable_party_group(callback: CallbackQuery):
    if callback.message is not None and callback.message.chat.type == "private":
        await callback.answer("Не удалось проверить состав пати. Открой её заново.", show_alert=True)


@router.message(F.chat.type.in_({"group", "supergroup"}))
async def consume_group_message(message: Message):
    # Metadata was already journaled by the session. Group chat text never enters private account forms.
    return


async def connect_group_command(message: Message, api, settings, storage):
    if message.chat.type not in {"group", "supergroup"} or message.from_user is None or message.from_user.id not in settings.admin_ids:
        return
    user_id = message.from_user.id
    try:
        pool = api.party_rooms
        chat, staff = await pool.validate_group(message.chat.id, owner_id=user_id)
        await api.rooms_request("POST", "/admin/register", {"botId": str(message.bot.id), "adminId": str(user_id),
            "chatId": str(chat.id), "title": chat.title, "staffIds": staff})
        await pool.sync()
        storage.journal_room_message(message.bot.id, message.chat.id, message.message_id, int(message.date.timestamp()))
        await message.delete()
        pool.wakeup.set()
        result = f"✅ Группа «{chat.title}» подключена."
    except ValueError as error:
        result = f"Группа «{message.chat.title}»: {error}"
    except Exception:
        result = f"Не удалось подключить группу «{message.chat.title}». Проверь права FDP и попробуй ещё раз."
    api.party_rooms.registration_results.setdefault(user_id, []).append(result)
    api.party_rooms.registration_after[user_id] = time.time() + 1.5
    api.party_rooms.wakeup.set()


# Put the setup command before the generic group-message consumer.
router.message.register(connect_group_command, Command("fdpchat"))
setup_handler = router.message.handlers.pop()
consumer_index = next(index for index, handler in enumerate(router.message.handlers) if handler.callback is consume_group_message)
router.message.handlers.insert(consumer_index, setup_handler)


@router.chat_member()
@router.my_chat_member()
@router.chat_join_request()
async def consume_group_event(event):
    return


def create_room_worker_router():
    """A helper bot handles only group operations and the pool's administrator UI."""
    worker = Router(name="room-worker-only")

    @worker.message(CommandStart())
    @worker.message(Command("admin"))
    async def open_worker_admin(message: Message, state: FSMContext, api, settings, storage):
        if authorized(message, settings):
            await state.clear()
            await show_rooms(message.bot, api, settings, storage, message.from_user.id, message.chat.id)
        elif message.chat.type == "private":
            await message.answer("Этот бот обслуживает чаты пати FDP. Поиск игроков и аккаунт — в @FDPdotabot.")

    worker.callback_query.register(room_admin_action, F.data.startswith("roomadmin:"))
    @worker.callback_query(F.data == "admin:refresh")
    async def return_worker_admin(callback: CallbackQuery, api, settings, storage):
        if authorized(callback, settings):
            acknowledge_callback(callback)
            await show_rooms(callback.bot, api, settings, storage, callback.from_user.id, callback.message.chat.id)
        else:
            await callback.answer("Нет доступа", show_alert=True)
    worker.callback_query.register(group_ready, F.data.regexp(r"^roomready:[a-f0-9-]{36}:\d+$"))
    worker.callback_query.register(group_discord, F.data.regexp(r"^roomdiscord:[a-f0-9-]{36}:\d+$"))
    worker.callback_query.register(group_ping_menu, F.data.regexp(r"^roomping:[a-f0-9-]{36}:\d+$"))
    worker.callback_query.register(group_ping_player, F.data.regexp(r"^roomping:pick:[a-f0-9]{20}$"))
    worker.message.register(register_selected_room, F.chat_shared)
    worker.message.register(change_room_capacity, RoomSettings.capacity, F.text)
    worker.message.register(connect_group_command, Command("fdpchat"))
    worker.message.register(consume_group_message, F.chat.type.in_({"group", "supergroup"}))
    worker.chat_member.register(consume_group_event)
    worker.my_chat_member.register(consume_group_event)
    worker.chat_join_request.register(consume_group_event)
    return worker
