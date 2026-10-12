"""Durable tournament contexts and notifications, independent of party search."""

import asyncio
import json
import logging
import re
import time
from datetime import datetime, timedelta, timezone
from html import escape
from urllib.parse import quote, urlsplit
from uuid import UUID, uuid4

from aiogram import Bot
from aiogram.exceptions import TelegramAPIError, TelegramForbiddenError
from aiogram.types import CopyTextButton, InlineKeyboardButton, InlineKeyboardMarkup

from ..api.client import ApiError, OpiniaApi
from ..config import Settings
from ..storage.database import BotStorage

logger = logging.getLogger(__name__)
CONTEXT_PREFIX = "tournament_context:"
PENDING_KEY = "pending_tournament"
ROLE_NAMES = {"1": "Керри", "2": "Мид", "3": "Оффлейн", "4": "Саппорт", "5": "Хард-саппорт"}
POLL_BATCH_SIZE = 24
POLL_CONCURRENCY = 2
ROSTER_POLL_SECONDS = 20


def uuid_hex(value) -> str | None:
    try:
        return UUID(str(value)).hex
    except (ValueError, TypeError, AttributeError):
        return None


def tournament_callback(action: str, event_hex: str, role: str | None = None) -> str:
    if re.fullmatch(r"[a-f0-9]{32}", event_hex) is None:
        raise ValueError("Invalid tournament callback context")
    data = f"tr:{action}:{event_hex}" + (f":{role}" if role else "")
    if len(data.encode("utf-8")) > 64:
        raise ValueError("Tournament callback exceeds Telegram's limit")
    return data


def save_tournament_context(storage: BotStorage, user_id: int, tournament: dict, **changes) -> dict:
    event_hex = uuid_hex(tournament.get("id"))
    slug = tournament.get("slug")
    if not event_hex or not isinstance(slug, str) or not slug:
        raise ApiError("Не удалось определить турнир. Откройте список заново.")
    context = storage.get_choice(user_id, CONTEXT_PREFIX + event_hex, 0) or {}
    context.update(eventHex=event_hex, eventId=str(UUID(event_hex)), slug=slug,
                   title=str(tournament.get("title") or "Турнир")[:120],
                   status=tournament.get("status"), startsAt=tournament.get("startsAt"))
    context.update(changes)
    storage.set_choices(user_id, CONTEXT_PREFIX + event_hex, [context])
    return context


def load_tournament_context(storage: BotStorage, user_id: int, event_hex: str) -> dict:
    if re.fullmatch(r"[a-f0-9]{32}", event_hex) is None:
        raise ApiError("Кнопка устарела. Откройте список турниров заново.")
    context = storage.get_choice(user_id, CONTEXT_PREFIX + event_hex, 0)
    if not context or context.get("eventHex") != event_hex or not context.get("slug"):
        raise ApiError("Кнопка устарела. Откройте список турниров заново.")
    return context


def tournament_api_path(context: dict) -> str:
    return "/dota/tournaments/" + quote(str(context["slug"]), safe="")


def _validate_participation(context: dict, result: dict) -> None:
    tournament = result.get("tournament") or {}
    if uuid_hex(tournament.get("id")) != context["eventHex"] or tournament.get("slug") != context["slug"]:
        raise ApiError("Турнир изменился. Откройте список заново.")


def remember_participation(storage: BotStorage, user_id: int, context: dict, result: dict) -> dict:
    _validate_participation(context, result)
    tournament = result["tournament"]
    previous = load_tournament_context(storage, user_id, context["eventHex"])
    state = result.get("state")
    changes = {"state": state, "lastPollAt": time.time()}
    if state == "WAITING":
        if previous.get("state") != "WAITING" or not previous.get("waitToken"):
            changes["waitToken"] = uuid4().hex
    elif state == "REQUESTED":
        request = result.get("request") or {}
        entry_id = request.get("entryId")
        role = str(request.get("role") or "")
        changes.update(requestEntryId=entry_id, requestEntryName=str(request.get("entryName") or "Команда")[:80],
                       requestRole=role)
        if (previous.get("state") != "REQUESTED" or not previous.get("requestToken")
                or previous.get("requestEntryId") != entry_id or previous.get("requestRole") != role):
            changes["requestToken"] = uuid4().hex
    elif state == "JOINED":
        entry = result.get("entry") or {}
        changes.update(entryId=entry.get("id"), entryStatus=entry.get("status"), memberCount=len(entry.get("members") or []))
        if previous.get("state") != "JOINED" or previous.get("entryId") != entry.get("id") or not previous.get("memberToken"):
            changes["memberToken"] = uuid4().hex
    if state != previous.get("state"):
        changes["nextPollAt"] = 0
    return save_tournament_context(storage, user_id, tournament, **changes)


def tournament_date_text(value) -> str:
    if not value:
        return "Дата будет объявлена"
    try:
        date = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if date.tzinfo is None:
            date = date.replace(tzinfo=timezone.utc)
        return date.astimezone(timezone(timedelta(hours=3))).strftime("%d.%m.%Y · %H:%M МСК")
    except (TypeError, ValueError):
        return "Дата будет объявлена"


def tournament_overview_text(tournament: dict) -> str:
    lines = [f"🏆 <b>{escape(str(tournament.get('title') or 'Турнир')[:120])}</b>", ""]
    description = str(tournament.get("description") or "").strip()
    if description:
        lines += [escape(description[:220]), ""]
    mode = {"CAPTAINS_DRAFT": "Captains Draft", "CAPTAINS_MODE": "Captains Mode", "ALL_PICK": "All Pick"}.get(tournament.get("gameMode"))
    match_format = str(tournament.get("format") or "").strip()[:60].replace("5x5", "5×5").replace("5х5", "5×5")
    if match_format or mode:
        lines.append("🎮 <b>Формат:</b> " + escape(" · ".join(part for part in (match_format, mode) if part)))
    if tournament.get("startsAt"):
        lines.append("🗓 <b>Старт:</b> " + tournament_date_text(tournament["startsAt"]))
    if tournament.get("status") == "REGISTRATION_OPEN" and tournament.get("registrationClosesAt"):
        lines.append("⏳ <b>Регистрация до:</b> " + tournament_date_text(tournament["registrationClosesAt"]))
    lines += ["", "👥 <b>Можно одному или с друзьями</b>",
              "Найди команду или создай свою и добери игроков через FDP.",
              "", "📋 Правила и условия участия — по кнопке ниже."]
    return "\n".join(lines)


def tournament_rules_button(tournament: dict, settings: Settings) -> InlineKeyboardButton:
    rules_url = str(tournament.get("rulesUrl") or "").strip()
    parsed = urlsplit(rules_url)
    if parsed.scheme not in {"https", "http"} or not parsed.netloc:
        rules_url = f"{settings.site_url.rstrip('/')}/games/tournaments/{quote(str(tournament.get('slug') or ''), safe='')}"
    return InlineKeyboardButton(text="📋 Правила турнира", url=rules_url)


def tournament_status_text(result: dict) -> str:
    tournament = result.get("tournament") or {}
    if result.get("state") in {"NONE", "NEEDS_PROFILE"}:
        return tournament_overview_text(tournament)
    lines = [f"🏆 <b>{escape(str(tournament.get('title') or 'Турнир')[:120])}</b>", ""]
    state = result.get("state")
    entry = result.get("entry") or {}
    if state == "WAITING":
        roles = [ROLE_NAMES[str(role)] for role in (result.get("queueRoles") or result.get("roles") or []) if str(role) in ROLE_NAMES]
        lines += ["⏳ <b>Ищем команду для турнира</b>",
                  "Позиции: " + (", ".join(roles) or "любая выбранная в профиле"),
                  "Капитаны могут пригласить тебя. Можно выбрать состав и вступить или подать заявку."]
        if result.get("queueMode") == "AUTO":
            lines.append("Автоподбор включён — можем автоматически записать на выбранную позицию.")
    elif state == "REQUESTED":
        request = result.get("request") or {}
        lines += ["📨 <b>Заявка отправлена капитану</b>",
                  escape(str(request.get("entryName") or "Команда")[:80]),
                  "Позиция: " + escape(ROLE_NAMES.get(str(request.get("role")), "не выбрана")),
                  "Дождитесь подтверждения капитана."]
    elif state == "JOINED":
        members = entry.get("members") or []
        lines += [f"<b>{escape(str(entry.get('name') or 'Моя команда')[:80])}</b>"]
        status = entry.get("status")
        if status == "REGISTERED":
            lines.append("✅ <b>Команда зарегистрирована на турнир</b>")
        elif status == "RESERVE":
            lines.append(f"🟡 <b>Команда в резерве · {len(members)}/5</b>")
            lines.append("Организатор может пригласить полный состав в основную сетку.")
        else:
            lines.append(f"👥 <b>Собираем состав · {len(members)}/5</b>")
        for member in members[:5]:
            name = escape(str(member.get("name") or "Игрок")[:40])
            role = ROLE_NAMES.get(str(member.get("role")), "роль не выбрана")
            mmr = member.get("mmr")
            lines.append(f"• {name} · {role} · {escape(str(mmr if mmr is not None else '—'))} MMR")
        if str(entry.get("ownRole")) in ROLE_NAMES:
            lines.append("Ваша позиция: " + ROLE_NAMES[str(entry["ownRole"])])
    elif state == "CLOSED":
        lines += ["Регистрация и подбор команды для этого турнира завершены."]
    else:
        lines += ["Выберите, как участвовать в турнире."]
    return "\n".join(lines)


def tournament_status_keyboard(result: dict, context: dict, settings: Settings) -> InlineKeyboardMarkup:
    event_hex = context["eventHex"]
    rows = []
    if result.get("state") == "JOINED":
        entry_hex = uuid_hex((result.get("entry") or {}).get("id"))
        rows.append([InlineKeyboardButton(text="🌐 Моя команда", callback_data=tournament_callback("web", event_hex))])
        if entry_hex:
            username = getattr(settings, "main_bot_username", "FDPdotabot")
            invitation = f"https://t.me/{username}?start=te_{entry_hex}"
            rows.append([InlineKeyboardButton(text="📋 Пригласить друзей", copy_text=CopyTextButton(text=invitation))])
        entry = result.get("entry") or {}
        if entry.get("isCaptain") and len(entry.get("members") or []) < 5:
            rows.append([InlineKeyboardButton(text="Поиск игроков" if entry.get("recruiting") else "Ищем игроков", callback_data=tournament_callback("recruits" if entry.get("recruiting") else "recruit-start", event_hex))])
    elif result.get("state") in {"WAITING", "REQUESTED"}:
        if result["state"] == "WAITING":
            rows.append([InlineKeyboardButton(text="Команды со свободными местами", callback_data=tournament_callback("solo", event_hex))])
        rows.append([InlineKeyboardButton(text="Отменить подбор" if result["state"] == "WAITING" else "Отозвать заявку",
                                         callback_data=tournament_callback("cancel", event_hex))])
    elif result.get("state") != "CLOSED":
        rows.append([InlineKeyboardButton(text="🎮 Участвовать", callback_data=tournament_callback("signup", event_hex))])
    rows += [[tournament_rules_button(result.get("tournament") or context, settings)],
             [InlineKeyboardButton(text="🔄 Обновить статус", callback_data=tournament_callback("status", event_hex))],
             [InlineKeyboardButton(text="← Турниры", callback_data="tournaments:list")]]
    return InlineKeyboardMarkup(inline_keyboard=rows)


async def fresh_tournament_web_url(api: OpiniaApi, settings: Settings, user_id: int, next_path: str) -> str:
    ticket = await api.create_web_access_ticket(user_id)
    return (f"{settings.site_url.rstrip('/')}/telegram/access?ticket={quote(ticket, safe='')}"
            f"&next={quote(next_path, safe='')}")


async def deliver_tournament_participation_notice(bot: Bot, api: OpiniaApi, settings: Settings,
                                                storage: BotStorage, row: dict) -> bool:
    """Deliver the server's durable outbox after checking the user's current entry."""
    payload = row.get("payload") or {}
    event = payload.get("event")
    event_hex = uuid_hex(payload.get("tournamentId"))
    slug = payload.get("tournamentSlug")
    notification_id = str(row.get("id") or "")
    try:
        user_id = int(row.get("telegramUserId"))
    except (TypeError, ValueError):
        return True
    if (user_id <= 0 or not event_hex or not isinstance(slug, str) or not slug
            or event not in {"found", "accepted", "registered", "request-closed"}):
        return True
    if notification_id and storage.has_delivered_notification(notification_id):
        return True
    context = {"eventHex": event_hex, "eventId": str(UUID(event_hex)), "slug": slug}
    try:
        if storage.get_session(user_id) is None:
            auth = await api.login_telegram_bot_session(user_id)
            storage.save_session(user_id, auth["accessToken"], auth["refreshToken"])
        result = await api.user(user_id, "GET", tournament_api_path(context) + "/participation")
        _validate_participation(context, result)
        context = save_tournament_context(storage, user_id, result["tournament"])
        remember_participation(storage, user_id, context, result)
    except ApiError:
        logger.warning("Could not load tournament notification state for user %s", user_id)
        return False

    entry = result.get("entry") or {}
    if result["tournament"].get("status") in {"COMPLETED", "CANCELLED"}:
        return True
    if event == "request-closed":
        if result.get("state") != "NONE":
            return True
        name = escape(str(payload.get("entryName") or "Команда")[:80])
        text = (f"📨 <b>Заявка в команду закрыта</b>\n\n🏆 {escape(context['title'])}\n"
                f"Команда: <b>{name}</b>.\n\n"
                "Эта заявка больше не активна. Можно выбрать другую команду или запустить подбор состава.")
        markup = InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="Выбрать команду", callback_data=tournament_callback("solo", event_hex))
        ]])
    else:
        target_entry = uuid_hex(payload.get("entryId"))
        if (result.get("state") != "JOINED" or not target_entry or uuid_hex(entry.get("id")) != target_entry
                or entry.get("status") not in {"RECRUITING", "REGISTERED", "RESERVE"}
                or (event == "registered" and entry.get("status") != "REGISTERED")):
            return True
        headline = {"found": "Команда найдена", "accepted": "Вашу заявку приняли", "registered": "Состав собран"}[event]
        text = f"✅ <b>{headline}</b>\n\n" + tournament_status_text(result)
        markup = InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="Открыть мою команду", callback_data=tournament_callback("web", event_hex))
        ]])
    try:
        await bot.send_message(user_id, text, reply_markup=markup, parse_mode="HTML", disable_web_page_preview=True)
    except TelegramForbiddenError:
        storage.mark_bot_user_blocked(user_id)
    except TelegramAPIError:
        return False
    if notification_id:
        storage.remember_delivered_notification(notification_id)
    return True


def monitored_tournament_contexts(storage: BotStorage) -> list[tuple[int, dict]]:
    # Reuse the bot's durable choices table without adding a tournament migration.
    with storage.lock:
        rows = storage._connection().execute(
            """SELECT telegram_user_id, items_json FROM callback_choices
               WHERE kind GLOB 'tournament_context:*'
                 AND (json_extract(items_json, '$[0].state') IN ('WAITING', 'REQUESTED')
                   OR (json_extract(items_json, '$[0].state') = 'JOINED'
                     AND json_extract(items_json, '$[0].entryStatus') IN ('RECRUITING', 'RESERVE')
                     AND COALESCE(json_extract(items_json, '$[0].status'), '') NOT IN ('COMPLETED', 'CANCELLED')))
                 AND COALESCE(json_extract(items_json, '$[0].nextPollAt'), 0) <= ?
               ORDER BY COALESCE(json_extract(items_json, '$[0].lastPollAt'), 0), telegram_user_id
               LIMIT ?""", (time.time(), POLL_BATCH_SIZE),
        ).fetchall()
    contexts = []
    for row in rows:
        try:
            context = json.loads(row["items_json"])[0]
            if uuid_hex(context.get("eventId")) == context.get("eventHex") and context.get("slug"):
                contexts.append((int(row["telegram_user_id"]), context))
        except (ValueError, TypeError, KeyError, IndexError, json.JSONDecodeError):
            continue
    return contexts


def waiting_tournament_contexts(storage: BotStorage) -> list[tuple[int, dict]]:
    return [(user_id, context) for user_id, context in monitored_tournament_contexts(storage)
            if context.get("state") == "WAITING"]


def _monitored(context: dict) -> bool:
    return context.get("state") in {"WAITING", "REQUESTED"} or (
        context.get("state") == "JOINED" and context.get("entryStatus") in {"RECRUITING", "RESERVE"}
        and context.get("status") not in {"COMPLETED", "CANCELLED"})


def _monitor_token_field(context: dict) -> str:
    return {"WAITING": "waitToken", "REQUESTED": "requestToken", "JOINED": "memberToken"}[context["state"]]


async def poll_tournament_participation(bot: Bot, api: OpiniaApi, settings: Settings,
                                       storage: BotStorage, user_id: int, context: dict) -> None:
    # Re-read before polling: a callback may have cancelled the queue or request.
    current = load_tournament_context(storage, user_id, context["eventHex"])
    if not _monitored(current):
        return
    token_field = _monitor_token_field(current)
    changes = {"lastPollAt": time.time(), "nextPollAt": time.time() + (ROSTER_POLL_SECONDS if current["state"] == "JOINED" else 5)}
    if not current.get(token_field):
        changes[token_field] = uuid4().hex
    current = save_tournament_context(storage, user_id,
        {"id": current["eventId"], **current}, **changes)
    if storage.get_session(user_id) is None:
        return
    result = await api.user(user_id, "GET", tournament_api_path(current) + "/participation")
    _validate_participation(current, result)
    latest = load_tournament_context(storage, user_id, context["eventHex"])
    if latest.get("state") != current["state"] or latest.get(token_field) != current.get(token_field):
        return
    # Found, accepted, registered and declined events come from the server outbox,
    # including website users who have never opened a tournament card in the bot.
    if current["state"] not in {"WAITING", "REQUESTED"} or result.get("state") != "CLOSED":
        remember_participation(storage, user_id, latest, result)
        return
    marker = f"tournament:{user_id}:{current['eventHex']}:{current[token_field]}:closed"
    if not storage.has_delivered_notification(marker):
        text = tournament_status_text(result)
        markup = InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="Другие турниры", callback_data="tournaments:list")
        ]])
        try:
            await bot.send_message(user_id, text, reply_markup=markup, parse_mode="HTML", disable_web_page_preview=True)
        except TelegramForbiddenError:
            storage.mark_bot_user_blocked(user_id)
        except TelegramAPIError:
            # Keep the previous state so transient failures retry the same marker.
            raise
        storage.remember_delivered_notification(marker)
    remember_participation(storage, user_id, latest, result)


async def poll_waiting_tournament(bot: Bot, api: OpiniaApi, settings: Settings,
                                  storage: BotStorage, user_id: int, context: dict) -> None:
    await poll_tournament_participation(bot, api, settings, storage, user_id, context)


async def tournament_participation_worker(bot: Bot, api: OpiniaApi, settings: Settings, storage: BotStorage) -> None:
    if getattr(settings, "room_worker_only", False):
        return
    semaphore = asyncio.Semaphore(POLL_CONCURRENCY)

    async def poll(user_id: int, context: dict) -> None:
        async with semaphore:
            try:
                await poll_tournament_participation(bot, api, settings, storage, user_id, context)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.warning("Could not refresh tournament participation for user %s", user_id, exc_info=True)

    while True:
        try:
            await asyncio.gather(*(poll(user_id, context) for user_id, context in monitored_tournament_contexts(storage)))
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Tournament participation poll failed")
        await asyncio.sleep(5)
