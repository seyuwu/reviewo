from html import escape
from urllib.parse import quote, urlencode
from uuid import UUID

from aiogram.exceptions import TelegramAPIError, TelegramForbiddenError, TelegramNetworkError
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from ..api.client import ApiError
from .tournament_participation import ROLE_NAMES, save_tournament_context, tournament_callback, uuid_hex
from .telegram_session import is_connection_setup_failure


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
                     "Позиция: " + escape(roles), "", "Подтверди приглашение, чтобы вступить. Оно действует 20 минут и не резервирует место."]
            if invite.get("status") == "RESERVE":
                lines.append("Состав в резерве: место в основной сетке пока не подтверждено.")
            markup = InlineKeyboardMarkup(inline_keyboard=[[
                InlineKeyboardButton(text="Посмотреть приглашение", callback_data="tinvite:" + UUID(str(row["id"])).hex)
            ]])
            storage.set_choices(user_id, "tournament_recruit_invite:" + UUID(str(row["id"])).hex, [{"eventHex": event_hex}])
        save_tournament_context(storage, user_id, {"id": str(UUID(event_hex)), "slug": slug, "title": payload.get("tournamentTitle")})
    except ApiError as error:
        if error.status in {401, 403, 404, 409}:
            return True
        return False
    try:
        await bot.send_message(user_id, "\n".join(lines), parse_mode="HTML", reply_markup=markup, disable_web_page_preview=True)
    except TelegramForbiddenError:
        storage.mark_bot_user_blocked(user_id)
    except TelegramNetworkError as error:
        return not is_connection_setup_failure(error)
    except TelegramAPIError:
        return False
    return True
