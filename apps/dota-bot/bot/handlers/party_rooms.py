from collections import Counter
from html import escape
import secrets
import time
from urllib.parse import urlencode

from aiogram import F, Router
from aiogram.filters import Command, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import (CallbackQuery, ChatAdministratorRights, InlineKeyboardButton, InlineKeyboardMarkup,
    KeyboardButton, KeyboardButtonRequestChat, Message, ReplyKeyboardMarkup, ReplyKeyboardRemove)

from ..api.client import ApiError
from ..services.callbacks import acknowledge_callback
from ..services.panel import edit_panel, edit_panel_content
from ..ui.keyboards import button

router = Router(name="party-rooms")
STATES = {"FREE": "Свободна", "PREPARING": "Подготовка", "ACTIVE": "Занята", "ROTATING": "Смена приглашения", "CLOSING": "Очистка", "REVIEW": "Требует проверки"}


class RoomSettings(StatesGroup):
    choosing_group = State()
    capacity = State()


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
            snapshot = await admin_snapshot(api, callback.bot, user_id)
            room = next((room for room in snapshot["rooms"] if room["id"] == parts[2]), None)
            if not room:
                await show_rooms(callback.bot, api, settings, storage, user_id, user_id, notice="Группа уже удалена из списка.")
                return
            text = f"<b>{escape(room.get('partyName') or room['title'])}</b>\n\nСостояние: {STATES[room['state']]}\nВыдача: {'включена' if room['enabled'] else 'отключена'}"
            if room["removeWhenFree"]:
                text += "\nУдаление из списка после завершения пати."
            if room.get("error"):
                text += "\n\nТребуется проверить права, участников и очистку группы."
            rows = []
            if room.get("inviteLink"):
                rows.append([InlineKeyboardButton(text="💬 Открыть группу", url=room["inviteLink"])])
            else:
                rows.append([InlineKeyboardButton(text="💬 Открыть группу", url=f"https://t.me/c/{room['chatId'][4:]}/1")])
            toggle = "disable" if room["enabled"] else "enable"
            rows.append([button("⏸ Исключить из выдачи" if room["enabled"] else "▶️ Включить выдачу", f"roomadmin:do:{room['id']}:{toggle}")])
            rows.append([button("🗑 Удалить из списка", f"roomadmin:confirm:{room['id']}:remove")])
            if room["state"] == "REVIEW":
                rows.append([button("Повторить очистку", f"roomadmin:confirm:{room['id']}:retry")])
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
            await api.rooms_request("POST", f"/admin/{parts[2]}", payload)
            await show_rooms(callback.bot, api, settings, storage, user_id, user_id, notice="Сохранено.")
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
    except ApiError:
        await callback.answer("Состав изменился. Открой текущую карточку пати.", show_alert=True)


@router.callback_query(F.data.regexp(r"^roomopen:[a-f0-9]{20}$"))
async def open_party_group(callback: CallbackQuery, api, settings, storage):
    if callback.message is None or callback.message.chat.type != "private" or callback.message.chat.id != callback.from_user.id:
        acknowledge_callback(callback)
        return
    context = storage.get_choice(callback.from_user.id, "party_coordination_token:" + callback.data.split(":")[1], 0)
    if not isinstance(context, dict):
        await callback.answer("Открой свою пати заново.", show_alert=True)
        return
    acknowledge_callback(callback, "Подготавливаем чат…")
    await api.party_rooms.for_user(callback.from_user.id, context["partySlug"])
    await edit_panel(callback.bot, storage, api, settings, callback.from_user.id, "party")


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
    worker.message.register(register_selected_room, F.chat_shared)
    worker.message.register(change_room_capacity, RoomSettings.capacity, F.text)
    worker.message.register(connect_group_command, Command("fdpchat"))
    worker.message.register(consume_group_message, F.chat.type.in_({"group", "supergroup"}))
    worker.chat_member.register(consume_group_event)
    worker.my_chat_member.register(consume_group_event)
    worker.chat_join_request.register(consume_group_event)
    return worker
