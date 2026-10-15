"""Explicit, short-lived Dota ID replies in the assigned party group."""
import asyncio
from html import escape
import re
import time

from aiogram.exceptions import TelegramAPIError
from aiogram.types import ForceReply

from ..api.client import ApiError

CHOICE = "room_dota_id_reply"


def _lock(pool, user_id):
    return pool.dota_id_locks.setdefault(user_id, asyncio.Lock())


async def _prompt(pool, storage, user, context, error=""):
    name = escape(str(getattr(user, "full_name", None) or "Игрок")[:80])
    text = f'<a href="tg://user?id={user.id}">{name}</a>, <b>введи свой Dota ID для готовности</b>.\n\n'
    if error:
        text += escape(error) + "\n\n"
    text += ("Ответь на это сообщение: 8–10 цифр без пробелов. ID находится в профиле Dota 2, справа от ника.\n"
             "Сохраню ID в твоём профиле и подтвержу готовность. Запрос действует 5 минут.")
    sent = await pool.mutate("send_message", context["chatId"], text, parse_mode="HTML",
        reply_markup=ForceReply(force_reply=True, selective=True, input_field_placeholder="Dota ID: 8–10 цифр"))
    context = {**context, "promptId": sent.message_id, "expiresAt": time.time() + 300}
    storage.set_choices(user.id, CHOICE, [context])


async def request_group_dota_id(callback, api, settings, storage):
    message = callback.message
    pool = api.party_rooms
    if not message or message.chat.type != "supergroup" or not pool:
        await callback.answer("Открой текущую карточку в чате пати.", show_alert=True)
        return
    _, room_id, generation = callback.data.split(":")
    room = pool.by_chat.get(message.chat.id)
    if not room or room["id"] != room_id:
        await callback.answer("Кнопка устарела. Открой текущую карточку пати.", show_alert=True)
        return
    user_id = callback.from_user.id
    async with _lock(pool, user_id):
        key = (user_id, room_id)
        if pool.dota_id_cooldowns.get(key, 0) > time.time():
            await callback.answer("Уже открываем ввод Dota ID.")
            return
        pool.dota_id_cooldowns[key] = time.time() + 3
        try:
            context = await pool.request("POST", f"/{room_id}/dota-id/context", {
                "userId": str(user_id), "generation": int(generation)})
            saved = storage.get_choice(user_id, CHOICE, 0)
            if (isinstance(saved, dict) and saved.get("expiresAt", 0) > time.time()
                and saved.get("botId") == pool.bot.id and saved.get("chatId") == message.chat.id
                and saved.get("roomId") == room_id and saved.get("generation") == int(generation)
                and saved.get("membershipId") == context["membershipId"]):
                await callback.answer("Ответь на сообщение с просьбой ввести Dota ID.", show_alert=True)
                return
            await callback.answer("Введи Dota ID ответом на сообщение в чате.")
            await _prompt(pool, storage, callback.from_user, {
                **context, "roomId": room_id, "chatId": message.chat.id, "botId": pool.bot.id,
                "expiresAt": time.time() + 300})
        except ApiError:
            await callback.answer("Не получилось открыть ввод. Проверь пати и попробуй снова.", show_alert=True)
        except TelegramAPIError:
            # The existing main-bot profile form remains available.
            storage.set_choices(user_id, CHOICE, [])
            try:
                await callback.answer("Не получилось отправить запрос в чат. Добавь ID через «Аккаунт» в @FDPdotabot.", show_alert=True)
            except TelegramAPIError:
                pass


async def receive_group_dota_id(message, api, settings, storage):
    pool = api.party_rooms
    user = message.from_user
    reply = message.reply_to_message
    if (not pool or message.chat.type != "supergroup" or not user or user.is_bot
        or getattr(message, "sender_chat", None) or not reply or not reply.from_user
        or reply.from_user.id != pool.bot.id):
        return
    async with _lock(pool, user.id):
        context = storage.get_choice(user.id, CHOICE, 0)
        if (not isinstance(context, dict) or context.get("chatId") != message.chat.id
            or context.get("botId") != pool.bot.id or context.get("promptId") != reply.message_id):
            return
        room = pool.by_chat.get(message.chat.id)
        if (context.get("expiresAt", 0) <= time.time() or not room or room["id"] != context["roomId"]
            or (room.get("generation") is not None and room["generation"] != context["generation"])):
            storage.set_choices(user.id, CHOICE, [])
            await pool.mutate("send_message", message.chat.id, "Запрос Dota ID устарел. Нажми «Готов играть» в текущей карточке пати.")
            return
        value = (message.text or "").strip()
        if not re.fullmatch(r"[0-9]{8,10}", value):
            await _prompt(pool, storage, user, context, "Нужны 8–10 цифр без пробелов, не ссылка на Steam.")
            return
        try:
            result = await pool.request("POST", f"/{context['roomId']}/dota-id", {
                "userId": str(user.id), "generation": context["generation"],
                "partyId": context["partyId"], "membershipId": context["membershipId"], "dotaAccountId": value})
        except ApiError as error:
            if error.status in {403, 404} or (error.status == 409 and "already linked" not in str(error).lower()):
                storage.set_choices(user.id, CHOICE, [])
                await pool.mutate("send_message", message.chat.id, "Пати или состав изменились. Открой текущую карточку и нажми «Готов играть» заново.")
            else:
                hint = ("Этот Dota ID уже привязан к другому профилю. Проверь цифры."
                    if error.status == 409 else "Не удалось подтвердить результат. ID мог сохраниться; ответь ещё раз, чтобы проверить готовность.")
                await _prompt(pool, storage, user, context, hint)
            return
        storage.set_choices(user.id, CHOICE, [])
        pool.sync_after = 0
        pool.wakeup.set()
        name = escape(str(getattr(user, "full_name", None) or "Игрок")[:80])
        text = (f'<a href="tg://user?id={user.id}">{name}</a>, Dota ID сохранён. '
            + ("Готовность подтверждена ✅" if result.get("ready") else "Пати изменилась — готовность не подтверждена. Открой текущую карточку пати."))
        await pool.mutate("send_message", message.chat.id, text, parse_mode="HTML")
