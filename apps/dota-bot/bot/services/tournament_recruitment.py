from html import escape
from urllib.parse import quote, urlencode
from uuid import UUID
from datetime import datetime, timezone

from aiogram.exceptions import TelegramAPIError, TelegramForbiddenError, TelegramNetworkError
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from ..api.client import ApiError
from .tournament_participation import ROLE_NAMES, save_tournament_context, tournament_callback, uuid_hex
from .telegram_session import is_connection_setup_failure


async def consume_recruit_invite(bot, storage, user_id, token, message_id=None):
    key = "tournament_recruit_invite:" + token
    saved = storage.get_choice(user_id, key, 0) or {}
    stored_id = saved.get("messageId")
    # Persist consumption before awaiting Telegram so an in-flight send cannot
    # publish active buttons while deletion is still waiting for acknowledgement.
    storage.set_choices(user_id, key, [{**saved, "consumed": True, "messageId": None}])
    panel = storage.get_panel(user_id)
    for item in {stored_id, message_id} - {None}:
        if panel and panel.message_id == item and panel.chat_id == user_id:
            continue
        storage.add_temporary_message(user_id, user_id, item, 0)
        try:
            await bot.delete_message(user_id, item)
            storage.remove_temporary_message(user_id, item)
        except TelegramAPIError:
            try:
                await bot.edit_message_reply_markup(chat_id=user_id, message_id=item, reply_markup=None)
            except TelegramAPIError:
                pass


def retire_recruit_invites(storage, user_id, event_hex, result):
    for saved in storage.tournament_recruit_invites(user_id):
        if saved.get("eventHex") != event_hex or saved.get("consumed"):
            continue
        stale = result.get("state") != "WAITING"
        if saved.get("queueId") and result.get("queueId"):
            stale |= saved["queueId"] != result["queueId"] or saved.get("generation") != result.get("queueGeneration")
        if stale:
            if saved.get("messageId"):
                storage.add_temporary_message(user_id, user_id, saved["messageId"], 0)
            storage.set_choices(user_id, saved["key"], [{**saved, "consumed": True, "messageId": None}])


async def refresh_linked_tournament_session(api, storage, user_id):
    auth = await api.login_telegram_bot_session(user_id)
    storage.save_session(user_id, auth["accessToken"], auth["refreshToken"], clear_recovery_url=True)


async def deliver_tournament_recruitment_notice(bot, api, settings, storage, row):
    payload = row.get("payload") or {}
    event_hex = uuid_hex(payload.get("tournamentId"))
    entry_hex = uuid_hex(payload.get("entryId"))
    slug = payload.get("tournamentSlug")
    if not event_hex or not entry_hex or not isinstance(slug, str) or not slug:
        return True
    user_id = int(row["telegramUserId"])
    try:
        await refresh_linked_tournament_session(api, storage, user_id)
        base = "/dota/tournaments/" + quote(slug, safe="")
        if payload.get("type") == "tournament_recruiting":
            board = await api.user(user_id, "GET", base + f"/entries/{UUID(entry_hex)}/recruitment?" + urlencode({"notice": row["id"]}))
            if not board.get("enabled") or not board.get("needed") or not board.get("players"):
                return True
            lines = ["👥 <b>Игроки ищут команду для турнира</b>", "", f"<b>{escape(str(payload.get('tournamentTitle') or 'Турнир')[:100])}</b>",
                     f"Твой состав: {escape(str(board['name'])[:70])}", ""]
            for player in board["players"][:5]:
                roles = ", ".join(ROLE_NAMES.get(str(role), str(role)) for role in player.get("roles", []))
                mmr = player.get("mmr")
                lines.append(f"• <b>{escape(str(player['name'])[:40])}</b> · {escape(str(mmr if mmr is not None else '—'))} MMR\n  {escape(roles)}")
            lines += ["", "Открой игроков и предложи свободную позицию.",
                      "Чтобы не получать новые уведомления, нажми «Остановить поиск игроков»."]
            markup = InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(text="Посмотреть игроков", callback_data=tournament_callback("recruits", event_hex))],
                [InlineKeyboardButton(text="Остановить поиск игроков", callback_data=tournament_callback("recruit-stop", event_hex))]])
        else:
            invite = await api.user(user_id, "GET", base + "/participation/invites/" + quote(str(row["id"]), safe=""))
            roles = ", ".join(ROLE_NAMES.get(str(role), str(role)) for role in invite.get("roles", []))
            lines = ["📨 <b>Капитан приглашает в команду турнира</b>", "", escape(str(invite["tournamentTitle"])[:100]),
                     f"Команда: <b>{escape(str(invite['name'])[:80])}</b>", f"Капитан: {escape(str(invite['senderName'])[:60])}",
                     "Позиция: " + escape(roles), "", "Нажми «Посмотреть приглашение», выбери позицию и вступи. Приглашение действует до 6 часов и не резервирует место."]
            if invite.get("status") == "RESERVE":
                lines.append("Состав в резерве: место в основной сетке пока не подтверждено.")
            markup = InlineKeyboardMarkup(inline_keyboard=[[
                InlineKeyboardButton(text="Посмотреть приглашение", callback_data="tinvite:" + UUID(str(row["id"])).hex)
            ]])
            invite_key = "tournament_recruit_invite:" + UUID(str(row["id"])).hex
            old = storage.get_choice(user_id, invite_key, 0) or {}
            if old.get("consumed"):
                return True
            storage.set_choices(user_id, invite_key, [{"eventHex": event_hex, "entryId": invite["entryId"],
                "expiresAt": invite["expiresAt"], "queueId": payload.get("queueId"), "generation": payload.get("generation"), "messageId": None}])
        save_tournament_context(storage, user_id, {"id": str(UUID(event_hex)), "slug": slug, "title": payload.get("tournamentTitle")})
    except ApiError as error:
        if error.status in {401, 403, 404, 409}:
            return True
        return False
    try:
        message = await bot.send_message(user_id, "\n".join(lines), parse_mode="HTML", reply_markup=markup, disable_web_page_preview=True)
        if payload.get("type") == "tournament_team_invite":
            saved = storage.get_choice(user_id, invite_key, 0) or {}
            if saved.get("consumed"):
                storage.add_temporary_message(user_id, user_id, message.message_id, 0)
                try:
                    await bot.edit_message_reply_markup(chat_id=user_id, message_id=message.message_id, reply_markup=None)
                except TelegramAPIError:
                    pass
            else:
                storage.set_choices(user_id, invite_key, [{**saved, "messageId": message.message_id}])
                expiry = datetime.fromisoformat(saved["expiresAt"].replace("Z", "+00:00"))
                storage.add_temporary_message(user_id, user_id, message.message_id,
                    max(1, int((expiry - datetime.now(timezone.utc)).total_seconds())))
    except TelegramForbiddenError:
        storage.mark_bot_user_blocked(user_id)
    except TelegramNetworkError as error:
        return not is_connection_setup_failure(error)
    except TelegramAPIError:
        return False
    return True
