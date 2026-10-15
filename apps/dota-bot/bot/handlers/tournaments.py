"""Private Telegram tournament onboarding, entry invitations and participation."""

import logging
import re
import time
from html import escape
from urllib.parse import quote
from uuid import UUID, uuid4

from aiogram import F, Router
from aiogram.exceptions import TelegramAPIError
from aiogram.filters import CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

from ..api.client import ApiError, OpiniaApi
from ..config import Settings
from ..services.callbacks import acknowledge_callback
from ..services.panel import begin_panel_transition, edit_panel_content
from ..services.panel_activity import panel_repost_lock
from ..services.tournament_participation import (
    PENDING_KEY, ROLE_NAMES, fresh_tournament_web_url,
    load_tournament_context, remember_participation, save_tournament_context,
    tournament_api_path, tournament_callback, tournament_status_keyboard,
    tournament_status_text, tournament_date_text, tournament_overview_text, tournament_rules_button, participation_requests, uuid_hex,
    company_menu, tournament_team_settings_keyboard, retire_legacy_tournament_notice,
)
from ..storage.database import BotStorage

router = Router(name="tournaments")
logger = logging.getLogger(__name__)
_ACTIONS_KEY = "tournament_actions"
_PAGE_SIZE = 8
_STATUS_NAMES = {
    "REGISTRATION_OPEN": "Регистрация открыта", "REGISTRATION_CLOSED": "Регистрация закрыта",
    "IN_PROGRESS": "Идёт турнир", "COMPLETED": "Завершён", "CANCELLED": "Отменён",
}


def _button(text: str, action: str, event_hex: str, role: str | None = None) -> InlineKeyboardButton:
    return InlineKeyboardButton(text=text, callback_data=tournament_callback(action, event_hex, role))


def _back(event_hex: str | None = None) -> list[list[InlineKeyboardButton]]:
    return [[_button("← К турниру", "preview", event_hex)]] if event_hex else [
        [InlineKeyboardButton(text="← В меню", callback_data="panel:home")]
    ]


async def _private_callback(callback: CallbackQuery) -> bool:
    if (callback.message is None or callback.message.chat.type != "private"
            or callback.message.chat.id != callback.from_user.id):
        await callback.answer("Откройте турниры в личном чате с ботом.", show_alert=True)
        return False
    return True


async def _record_tournament_bot_started(api: OpiniaApi, storage: BotStorage, user_id: int) -> None:
    # Older bot users may have interacted before /start began recording this server flag.
    if storage.get_choice(user_id, "tournament_bot_started", 0):
        return
    try:
        await api.record_telegram_bot_started(user_id)
    except ApiError:
        logger.warning("Could not record tournament bot interaction for user %s", user_id)
        return
    storage.set_choices(user_id, "tournament_bot_started", [{"recorded": True}])


async def _panel(bot, storage, api, settings, user_id, chat_id, screen, text, rows) -> None:
    await edit_panel_content(bot, storage, api, settings, user_id, "tournaments:" + screen,
                             text, InlineKeyboardMarkup(inline_keyboard=rows), chat_id)


def _date_text(value) -> str:
    return tournament_date_text(value)


async def _events(api: OpiniaApi) -> list[dict]:
    result = await api.public("GET", "/dota/tournaments")
    items = result if isinstance(result, list) else (result or {}).get("items", [])
    return [item for item in items if isinstance(item, dict) and uuid_hex(item.get("id")) and item.get("slug")]


@router.callback_query(F.data.regexp(r"^tournaments:list(?::[0-9]{1,5})?$"))
async def list_tournaments(callback: CallbackQuery, api: OpiniaApi, settings: Settings, storage: BotStorage) -> None:
    if not await _private_callback(callback):
        return
    acknowledge_callback(callback)
    await begin_panel_transition(callback.bot, storage, callback.from_user.id, callback.message.chat.id)
    await _record_tournament_bot_started(api, storage, callback.from_user.id)
    try:
        events = await _events(api)
        page = min(int((callback.data or "").split(":")[2]) if (callback.data or "").count(":") == 2 else 0,
                   max(0, (len(events) - 1) // _PAGE_SIZE))
        rows = []
        lines = ["🏆 <b>Турниры Dota 2</b>", ""]
        for event in events[page * _PAGE_SIZE:(page + 1) * _PAGE_SIZE]:
            context = save_tournament_context(storage, callback.from_user.id, event)
            title = str(event.get("title") or "Турнир")[:70]
            lines.append(f"• <b>{escape(title)}</b> · {escape(_date_text(event.get('startsAt')))}")
            rows.append([_button(title, "open", context["eventHex"])])
        if not events:
            lines.append("Новые турниры скоро появятся здесь.")
        navigation = []
        if page:
            navigation.append(InlineKeyboardButton(text="← Назад", callback_data=f"tournaments:list:{page - 1}"))
        if (page + 1) * _PAGE_SIZE < len(events):
            navigation.append(InlineKeyboardButton(text="Далее →", callback_data=f"tournaments:list:{page + 1}"))
        if navigation:
            rows.append(navigation)
        rows += _back()
        await _panel(callback.bot, storage, api, settings, callback.from_user.id, callback.message.chat.id,
                     "list", "\n".join(lines), rows)
    except ApiError as error:
        await _panel(callback.bot, storage, api, settings, callback.from_user.id, callback.message.chat.id,
                     "error", "<b>Не удалось загрузить турниры</b>\n\n" + escape(str(error)),
                     [[InlineKeyboardButton(text="Повторить", callback_data="tournaments:list")]] + _back())


def _save_action_choices(storage: BotStorage, user_id: int, choices: list[dict]) -> list[dict]:
    for choice in choices:
        choice["token"] = uuid4().hex
    storage.set_choices(user_id, _ACTIONS_KEY, choices)
    return choices


def _action_choice(storage: BotStorage, user_id: int, token: str, kind: str) -> dict:
    for index in range(32):
        choice = storage.get_choice(user_id, _ACTIONS_KEY, index)
        if choice is None:
            break
        if choice.get("token") == token and choice.get("kind") == kind:
            return choice
    raise ApiError("Кнопка устарела. Обновите карточку турнира.")


def _clear_pending_ordinary_intent(storage: BotStorage, user_id: int) -> None:
    # Selecting a tournament replaces unfinished ordinary onboarding or party invitations.
    storage.set_choices(user_id, "pending_onboarding_action", [])
    storage.set_choices(user_id, "pending_solo_search", [])
    storage.set_choices(user_id, "pending_party_invite", [])
    draft = storage.get_choice(user_id, "registration_draft", 0)
    if draft:
        fields = {"pending_action", "party_invite_code", "party_invite_role", "required_role"}
        cleaned = {key: value for key, value in draft.items() if key not in fields}
        if cleaned != draft:
            storage.set_choices(user_id, "registration_draft", [cleaned])


def _save_pending(storage: BotStorage, user_id: int, context: dict, action: str, **options) -> dict:
    _clear_pending_ordinary_intent(storage, user_id)
    pending = {key: context[key] for key in ("eventId", "eventHex", "slug")}
    pending.update(action=action, **options)
    storage.set_choices(user_id, PENDING_KEY, [pending])
    return pending


def _clear_pending(storage: BotStorage, user_id: int, event_hex: str) -> None:
    pending = storage.get_choice(user_id, PENDING_KEY, 0) or {}
    if pending.get("eventHex") == event_hex:
        storage.set_choices(user_id, PENDING_KEY, [])


async def _participation(api, storage, user_id, context) -> dict:
    result = await api.user(user_id, "GET", tournament_api_path(context) + "/participation")
    remember_participation(storage, user_id, context, result)
    return result


async def _show_status(bot, api, settings, storage, user_id, chat_id, context, result) -> None:
    remember_participation(storage, user_id, context, result)
    if result.get("state") == "JOINED" and (result.get("entry") or {}).get("company"):
        text, markup = company_menu(storage, user_id, context, result, settings)
        await edit_panel_content(bot, storage, api, settings, user_id, "tournaments:company", text, markup, chat_id)
        return
    await edit_panel_content(bot, storage, api, settings, user_id, "tournaments:status",
                             tournament_status_text(result), tournament_status_keyboard(result, context, settings), chat_id)


async def _show_team_settings(bot, api, settings, storage, user_id, chat_id, context, result) -> None:
    if result.get("state") != "JOINED":
        await _show_status(bot, api, settings, storage, user_id, chat_id, context, result)
        return
    entry = result.get("entry") or {}
    rows = tournament_team_settings_keyboard(result, context, settings).inline_keyboard
    company = entry.get("company") or {}
    if company.get("selfConfirmed") and len(entry.get("members") or []) >= 2:
        company_menu(storage, user_id, context, result, settings)
        consent = storage.get_choice(user_id, "company_consent", 0)
        rows.insert(-1, [_button("⏸ Приостановить поиск вместе", "company-confirm", consent["token"])])
    text = "⚙️ <b>Настройки команды</b>\n\n<b>" + escape(str(entry.get("name") or "Команда")[:80]) + "</b>"
    if entry.get("isCaptain"):
        text += "\n\nНазвание, описание и управление участием в турнире."
    if company:
        text += "\n\n" + ("Поиск всей компанией включён." if company.get("confirmed")
                           else "Поиск всей компанией ожидает подтверждения участников.")
    await _panel(bot, storage, api, settings, user_id, chat_id, "team-settings", text, rows)


async def _show_modes(bot, api, settings, storage, user_id, chat_id, context) -> None:
    await _panel(bot, storage, api, settings, user_id, chat_id, "choose",
                 f"🏆 <b>{escape(context['title'])}</b>\n\nКак будете участвовать?",
                 [[_button("Найти команду для турнира", "solo", context["eventHex"])],
                  [_button("👥 Ищем с друзьями", "company", context["eventHex"])],
                  [_button("➕ Создать свою команду", "newteam", context["eventHex"])]] + _back(context["eventHex"]))


async def _ensure_profile(bot, state, api, settings, storage, user_id, chat_id, pending) -> bool:
    if storage.get_session(user_id) is None:
        try:
            auth = await api.login_telegram_bot_session(user_id)
        except ApiError as error:
            if error.status not in {401, 404}:
                raise
        else:
            storage.save_session(user_id, auth["accessToken"], auth["refreshToken"])
    if storage.get_session(user_id) is not None:
        try:
            await api.user(user_id, "GET", "/dota/profiles/me")
        except ApiError as error:
            if error.status != 404:
                raise
        else:
            await state.clear()
            return True
    from .registration import start_profile_registration

    await start_profile_registration(bot, state, api, settings, storage, user_id, chat_id,
                                     telegram_name=pending.get("telegramName"))
    return False


async def _show_sponsors(bot, api, settings, storage, user_id, chat_id, context, result) -> None:
    choices = _save_action_choices(storage, user_id, [
        {"kind": "sponsor", "eventHex": context["eventHex"], "sponsorId": sponsor["id"],
         "name": str(sponsor.get("name") or "Спонсор")[:70]}
        for sponsor in result.get("sponsors", []) if sponsor.get("id")
    ])
    rows = [[_button("Посмотреть: " + choice["name"], "sponsor", choice["token"])] for choice in choices]
    rows += [[_button("Я посмотрел — продолжить", "continue", context["eventHex"])]] + _back(context["eventHex"])
    await _panel(bot, storage, api, settings, user_id, chat_id, "sponsors",
                 "<b>Поддержите спонсоров турнира</b>\n\n"
                 "Откройте страницу одного из спонсоров. После просмотра нажмите «Я посмотрел — продолжить». "
                 "Сайт сохранит просмотр, и бот проверит, что шаг выполнен.", rows)


async def _show_solo(bot, api, settings, storage, user_id, chat_id, context, result) -> None:
    await _panel(bot, storage, api, settings, user_id, chat_id, "solo", tournament_status_text(result),
        tournament_status_keyboard(result, context, settings).inline_keyboard)


async def _show_team_catalog(bot, api, settings, storage, user_id, chat_id, context, page=0, company=False):
    board = await api.user(user_id, "GET", tournament_api_path(context) + f"/participation/{'company/teams' if company else 'teams'}?page={page}")
    context = save_tournament_context(storage, user_id, {"id": context["eventId"], **context},
        **({"companyCatalogPage": board["page"]} if company else {"teamCatalogPage": board["page"]}))
    items = [item for item in board.get("items", [])[:4] if uuid_hex(item.get("entryId"))]
    choices = _save_action_choices(storage, user_id, [
        {"kind": "company-pick" if company else "pickteam", "eventHex": context["eventHex"], "entryId": item["entryId"], "name": item.get("name"),
         **({"sourceEntryId": board["sourceEntryId"], "rosterVersion": board["rosterVersion"]} if company else {})}
        for item in items])
    lines = [f"🏆 <b>{escape(context['title'])}</b>", "", "<b>Выбери команду</b>",
        "Показаны команды, куда подходит вся ваша компания." if company else "Нажми название — увидишь игроков и позиции для вступления.",
        "📨 — твоя заявка уже отправлена. ✅ 5/5 — состав полный."]
    rows = []
    for item, choice in zip(items, choices):
        prefix = "📨 " if item.get("requestedRole") else "✅ " if item.get("memberCount", 0) >= 5 else ""
        label = prefix + str(item.get("name") or "Команда")[:38] + f" · {item.get('memberCount', 0)}/5"
        rows.append([_button(label, "company-pick" if company else "pickteam", choice["token"])])
    if not board.get("total"):
        lines += ["", "Пока нет команды с местами для всех. Можно добрать игроков в вашу компанию через «Настройки»." if company
                  else "Команд пока нет. Можешь создать свою в меню поиска."]
    else:
        lines += ["", f"Страница {board['page'] + 1}/{board['pageCount']} · команд: {board['total']}"]
    navigation = []
    if board["page"]:
        navigation.append(_button("← Назад", "company-page" if company else "teams-page", context["eventHex"], str(board["page"] - 1)))
    if board["page"] + 1 < board["pageCount"]:
        navigation.append(_button("Далее →", "company-page" if company else "teams-page", context["eventHex"], str(board["page"] + 1)))
    if navigation:
        rows.append(navigation)
    rows.append([_button("Обновить", "company-back" if company else "teams-back", context["eventHex"]),
        _button("← Компания" if company else "← Поиск команды", "status" if company else "solo", context["eventHex"])])
    await _panel(bot, storage, api, settings, user_id, chat_id, "team-catalog", "\n".join(lines), rows)


async def _show_search_settings(bot, api, settings, storage, user_id, chat_id, context, result):
    if result.get("state") not in {"WAITING", "REQUESTED"}:
        await _show_status(bot, api, settings, storage, user_id, chat_id, context, result)
        return
    lines = [f"🏆 <b>{escape(context['title'])}</b>", "", "⚙️ <b>Настройки поиска</b>"]
    rows = []
    if result.get("state") == "WAITING":
        roles = [ROLE_NAMES[str(role)] for role in result.get("queueRoles", []) if str(role) in ROLE_NAMES]
        automatic = result.get("queueMode") == "AUTO"
        lines += ["Позиции: " + (", ".join(roles) or "не выбраны"), "",
            "Автоподбор включён: FDP может записать тебя в подходящую команду." if automatic
            else "Автоподбор выключен: капитаны видят тебя, команду выбираешь сам."]
        rows += [[_button("Изменить позиции", "positions", context["eventHex"])],
                 [_button("Выключить автоподбор" if automatic else "Включить автоподбор", "manual" if automatic else "queue", context["eventHex"])],
                 [_button("Остановить поиск", "cancel", context["eventHex"])]]
    else:
        lines += [f"Активных заявок: {len(participation_requests(result))}.",
            "Ждём решения капитанов. Первое принятие снимет остальные заявки."]
        rows += [[_button("📨 Мои заявки", "applications", context["eventHex"])],
                 [_button("Отозвать все заявки", "cancel", context["eventHex"])]]
    rows.append([_button("← Поиск команды", "solo", context["eventHex"])])
    await _panel(bot, storage, api, settings, user_id, chat_id, "search-settings", "\n".join(lines), rows)


async def _show_friends(bot, api, settings, storage, user_id, chat_id, context, result, show_existing=True) -> None:
    roles = [str(role) for role in result.get("roles", []) if str(role) in ROLE_NAMES]
    role = context.get("friendsRole") if context.get("friendsRole") in ROLE_NAMES else (roles or ["1"])[0]
    context = save_tournament_context(storage, user_id, result["tournament"], friendsRole=role)
    rows = [[_button("📋 Получить ссылку для друзей" if context.get("companyFlow") else "Создать команду и пригласить друзей", "create", context["eventHex"])],
            [_button(("✓ " if selected == role else "") + ROLE_NAMES[selected], "role", context["eventHex"], selected)
             for selected in ("1", "2", "3")],
            [_button(("✓ " if selected == role else "") + ROLE_NAMES[selected], "role", context["eventHex"], selected)
             for selected in ("4", "5")]]
    teams = []
    try:
        parties = await api.user(user_id, "GET", "/social/parties/me") if show_existing else {}
        items = list(parties.get("parties") or [])
        if parties.get("team"):
            items.append(parties["team"])
        if parties.get("party"):
            items.append(parties["party"])
        seen = set()
        for party in items:
            if party.get("kind") == "TEAM" and party.get("isOwner") and party.get("slug") not in seen:
                seen.add(party["slug"])
                teams.append(party)
    except ApiError:
        # Creating an event squad stays available if persistent rosters cannot be loaded.
        pass
    choices = _save_action_choices(storage, user_id, [
        {"kind": "team", "eventHex": context["eventHex"], "teamSlug": team["slug"]} for team in teams[:3]
    ])
    for team, choice in zip(teams, choices):
        rows.append([_button("Участвовать: " + str(team.get("name") or "Моя команда")[:55], "team", choice["token"])])
    rows += _back(context["eventHex"])
    text = f"🏆 <b>{escape(context['title'])}</b>\n\nВаша позиция: <b>{ROLE_NAMES[role]}</b>.\n\n"
    text += ("👥 <b>Ищем с друзьями</b>\nВыбери свою позицию и получи ссылку. Друзья вступят по ней и выберут свои позиции."
             if context.get("companyFlow") else "<u>Если вы с друзьями то один создает команду и приглашает остальных</u>")
    await _panel(bot, storage, api, settings, user_id, chat_id, "friends", text, rows)


async def _show_invite_roles(bot, api, settings, storage, user_id, chat_id, context, pending, result=None) -> None:
    tournament = await api.user(user_id, "GET", tournament_api_path(context))
    entry = next((entry for entry in tournament.get("entries", [])
                  if uuid_hex(entry.get("id")) == uuid_hex(pending.get("entryId"))), None)
    if not entry or entry.get("status") not in {"RECRUITING", "REGISTERED", "RESERVE"}:
        raise ApiError("Команда уже завершила набор. Выберите другой вариант участия.")
    occupied = {str(member.get("positionRole", member.get("role"))) for member in entry.get("members", [])}
    roles = [role for role in ROLE_NAMES if role not in occupied]
    application = next((item for item in participation_requests(result or {}) if item.get("entryId") == pending["entryId"]), None)
    choices = _save_action_choices(storage, user_id, [
        {"kind": "join", "eventHex": context["eventHex"], "entryId": pending["entryId"], "role": role,
         "viaInvitation": bool(pending.get("viaInvitation"))}
        for role in roles
    ])
    direct = bool(pending.get("viaInvitation"))
    label = "Подать заявку · " if (entry.get("joinMode") == "CONFIRM" or entry.get("companySearchEnabled")) and not direct else "Вступить · "
    rows = [[_button(label + ROLE_NAMES[choice["role"]], "join", choice["token"])] for choice in choices] if not application or direct else []
    name = escape(str(entry.get("teamName") or pending.get("teamName") or "Команда")[:80])
    text = f"🏆 <b>{escape(context['title'])}</b>\n\n<b>Команда: {name}</b> · {len(entry.get('members', []))}/5\n"
    description = str(entry.get("description") or "").strip()
    text += "\n" + escape(description[:180]) + "\n" if description else "\nОписание команды пока не добавлено.\n"
    text += "\n<b>Игроки</b>\n"
    for member in entry.get("members", [])[:5]:
        player = escape(str(member.get("displayName") or "Игрок")[:32])
        profile_slug = member.get("dotaProfileSlug")
        if profile_slug:
            href = f"{settings.site_url.rstrip('/')}/dota/{quote(str(profile_slug), safe='')}"
            player = f'<a href="{escape(href, quote=True)}">{player}</a>'
        mmr = member.get("mmr")
        text += f"• {player} · {ROLE_NAMES.get(str(member.get('positionRole')), 'Без позиции')} · {mmr if mmr is not None else '—'} MMR\n"
    if application and not direct:
        text += "\n📨 Твоя заявка: " + ROLE_NAMES.get(str(application.get("role")), "позиция не выбрана") + ". Ждём капитана."
        rows.append([_button("Мои заявки", "applications", context["eventHex"])])
    else:
        text += "\nВыбери свободную позицию ниже." if roles else "\nСвободных мест сейчас нет."
    if entry.get("joinMode") == "CONFIRM" and not direct:
        text += "\nМожно отправить заявки в несколько команд: первое принятие снимет остальные."
    if entry.get("status") == "RESERVE":
        text += "\n🟡 Состав в резерве; место в основной сетке не подтверждено."
    if entry.get("companySearchEnabled"):
        text += "\n\n👥 Это компания друзей. После вступления подтверди «Ищем вместе» — организатор сможет отправить общую заявку."
    rows += [[_button("← Выбрать другую команду", "teams-back", context["eventHex"])]]
    await _panel(bot, storage, api, settings, user_id, chat_id, "invite", text, rows + _back(context["eventHex"]))


async def _run_intent(bot, state, api, settings, storage, user_id, chat_id, context, pending) -> None:
    if not await _ensure_profile(bot, state, api, settings, storage, user_id, chat_id, pending):
        return
    result = await _participation(api, storage, user_id, context)
    if result.get("state") in {"JOINED", "CLOSED"}:
        _clear_pending(storage, user_id, context["eventHex"])
        await _show_status(bot, api, settings, storage, user_id, chat_id, context, result)
        return
    if result.get("state") == "NEEDS_PROFILE":
        from .registration import start_profile_registration

        await start_profile_registration(bot, state, api, settings, storage, user_id, chat_id,
                                         telegram_name=pending.get("telegramName"))
        return
    if result.get("sponsorRequired"):
        await _show_sponsors(bot, api, settings, storage, user_id, chat_id, context, result)
        return
    action = pending.get("action")
    if action == "queue":
        result = await api.user(user_id, "POST", tournament_api_path(context) + "/participation/solo", {"mode": "AUTO", "roles": result.get("queueRoles") or result.get("roles") or []})
        await _show_status(bot, api, settings, storage, user_id, chat_id, context, result)
    elif action == "create":
        role = str(pending.get("role") or context.get("friendsRole") or (result.get("roles") or ["1"])[0])
        if role not in ROLE_NAMES:
            raise ApiError("Выберите позицию для команды.")
        await api.user(user_id, "POST", tournament_api_path(context) + "/squads",
                       {"positionRole": role, "joinMode": "OPEN", **({"companySearch": True} if context.get("companyFlow") else {})})
        result = await _participation(api, storage, user_id, context)
        await _show_status(bot, api, settings, storage, user_id, chat_id, context, result)
    elif action == "join":
        entry_hex = uuid_hex(pending.get("entryId"))
        if not entry_hex or pending.get("role") not in ROLE_NAMES:
            raise ApiError("Приглашение устарело. Откройте его заново.")
        await api.user(user_id, "POST", tournament_api_path(context) + f"/entries/{UUID(entry_hex)}/join",
                       {"positionRole": pending["role"], **({"viaInvitation": True} if pending.get("viaInvitation") else {})})
        result = await _participation(api, storage, user_id, context)
        await _show_status(bot, api, settings, storage, user_id, chat_id, context, result)
    elif action == "team":
        await api.user(user_id, "POST", tournament_api_path(context) + "/entries", {"teamSlug": pending["teamSlug"], "joinMode": "OPEN"})
        result = await _participation(api, storage, user_id, context)
        await _show_status(bot, api, settings, storage, user_id, chat_id, context, result)
    elif action in {"friends", "newteam", "company"}:
        if action in {"newteam", "company"} and result.get("state") == "WAITING":
            result = await api.user(user_id, "POST", tournament_api_path(context) + "/participation/cancel", {})
            remember_participation(storage, user_id, context, result)
            if result.get("state") == "JOINED":
                await _show_status(bot, api, settings, storage, user_id, chat_id, context, result)
                return
        await _show_friends(bot, api, settings, storage, user_id, chat_id, context, result, show_existing=action not in {"newteam", "company"})
    elif action == "invite":
        await _show_invite_roles(bot, api, settings, storage, user_id, chat_id, context, pending, result)
    elif action == "solo":
        if result.get("state") not in {"WAITING", "REQUESTED"}:
            result = await api.user(user_id, "POST", tournament_api_path(context) + "/participation/solo", {"mode": "BOARD"})
            remember_participation(storage, user_id, context, result)
        await _show_solo(bot, api, settings, storage, user_id, chat_id, context, result)
    else:
        await _show_modes(bot, api, settings, storage, user_id, chat_id, context)
    _clear_pending(storage, user_id, context["eventHex"])


async def _open_tournament(bot, api, settings, storage, user_id, chat_id, context) -> None:
    if storage.get_session(user_id):
        result = await _participation(api, storage, user_id, context)
        await _show_status(bot, api, settings, storage, user_id, chat_id, context, result)
        return
    # Public previews remain readable before profile registration or account linking.
    event = await api.public("GET", tournament_api_path(context))
    context = save_tournament_context(storage, user_id, event)
    rows = []
    if event.get("status") == "REGISTRATION_OPEN" or (event.get("status") == "REGISTRATION_CLOSED" and not event.get("bracketGeneratedAt")):
        rows.append([_button("🎮 Участвовать", "signup", context["eventHex"])])
    rows += [[tournament_rules_button(event, settings)],
             [InlineKeyboardButton(text="🌐 Страница турнира", url=f"{settings.site_url}/games/tournaments/{quote(context['slug'], safe='')}")],
             [InlineKeyboardButton(text="← Турниры", callback_data="tournaments:list")]]
    await _panel(bot, storage, api, settings, user_id, chat_id, "preview",
                 tournament_overview_text(event) + "\n\n" + escape(_STATUS_NAMES.get(event.get("status"), "Турнир")), rows)


@router.callback_query(F.data.startswith("tr:"))
async def tournament_action(callback: CallbackQuery, state: FSMContext, api: OpiniaApi,
                            settings: Settings, storage: BotStorage) -> None:
    if not await _private_callback(callback):
        return
    parts = (callback.data or "").split(":")
    if len(parts) not in {3, 4} or re.fullmatch(r"[a-f0-9]{32}", parts[2]) is None:
        await callback.answer("Кнопка устарела. Откройте турниры заново.", show_alert=True)
        return
    action, token = parts[1:3]
    user_id, chat_id = callback.from_user.id, callback.message.chat.id
    try:
        choice = _action_choice(storage, user_id, token, action) if action in {"join", "team", "sponsor", "pickteam", "withdraw", "leave-confirm"} else None
        context = load_tournament_context(storage, user_id, choice["eventHex"] if choice else token)
    except ApiError as error:
        await callback.answer(str(error), show_alert=True)
        return
    acknowledge_callback(callback)
    await begin_panel_transition(callback.bot, storage, user_id, chat_id)
    settings_guard = (panel_repost_lock(user_id), panel_repost_lock(user_id).revision) if action == "team-settings" else None
    await _record_tournament_bot_started(api, storage, user_id)
    try:
        if action == "open":
            await _open_tournament(callback.bot, api, settings, storage, user_id, chat_id, context)
        elif action == "preview":
            result = await _participation(api, storage, user_id, context)
            rows = []
            if result.get("state") in {"WAITING", "REQUESTED"}:
                rows.append([_button("👥 Вернуться к поиску", "solo", context["eventHex"])])
            elif result.get("state") != "CLOSED":
                rows.append([_button("Моя команда" if result.get("state") == "JOINED" else "🎮 Участвовать",
                    "status" if result.get("state") == "JOINED" else "signup", context["eventHex"])])
            rows += [[tournament_rules_button(result.get("tournament") or context, settings)],
                [InlineKeyboardButton(text="← Турниры", callback_data="tournaments:list")]]
            await _panel(callback.bot, storage, api, settings, user_id, chat_id, "preview",
                tournament_overview_text(result.get("tournament") or context), rows)
        elif action in {"teams", "teams-page", "teams-back", "search-settings", "manual"}:
            result = await _participation(api, storage, user_id, context)
            if result.get("state") not in {"WAITING", "REQUESTED"}:
                await _show_status(callback.bot, api, settings, storage, user_id, chat_id, context, result)
                return
            if action == "manual" and result.get("state") == "WAITING":
                result = await api.user(user_id, "POST", tournament_api_path(context) + "/participation/solo",
                    {"mode": "BOARD", "roles": result.get("queueRoles") or result.get("roles")})
                remember_participation(storage, user_id, context, result)
            if action in {"search-settings", "manual"}:
                await _show_search_settings(callback.bot, api, settings, storage, user_id, chat_id, context, result)
            else:
                page = int(context.get("teamCatalogPage") or 0) if action == "teams-back" else 0
                if action == "teams-page":
                    if len(parts) != 4 or not re.fullmatch(r"\d{1,5}", parts[3]) or int(parts[3]) > 10000:
                        raise ApiError("Страница устарела. Открой список команд заново.")
                    page = int(parts[3])
                await _show_team_catalog(callback.bot, api, settings, storage, user_id, chat_id, context, page)
        elif action == "signup":
            _save_pending(storage, user_id, context, "choose",
                          telegramName=callback.from_user.username or callback.from_user.full_name)
            await _show_modes(callback.bot, api, settings, storage, user_id, chat_id, context)
        elif action in {"solo", "friends", "newteam", "company", "queue", "create", "invite", "join", "team", "continue", "role", "pickteam"}:
            options = {"telegramName": callback.from_user.username or callback.from_user.full_name}
            if action in {"friends", "newteam", "company"}:
                context = save_tournament_context(storage, user_id, {"id": context["eventId"], **context},
                    newTeamFlow=action in {"newteam", "company"}, companyFlow=action == "company")
            if action == "pickteam":
                context = save_tournament_context(storage, user_id, {"id": context["eventId"], **context}, directEntryInvitation=False)
                options.update(entryId=choice["entryId"], teamName=choice.get("name"))
                action = "invite"
            elif action == "role":
                if len(parts) != 4 or parts[3] not in ROLE_NAMES:
                    raise ApiError("Выберите позицию из списка.")
                context = save_tournament_context(storage, user_id, {"id": context["eventId"], **context}, friendsRole=parts[3])
                action = "newteam" if context.get("newTeamFlow") else "friends"
            elif action in {"join", "team"}:
                options.update({key: choice[key] for key in ("entryId", "role", "viaInvitation") if key in choice})
                if action == "team":
                    options["teamSlug"] = choice["teamSlug"]
            elif action == "create":
                options["role"] = context.get("friendsRole")
            elif action == "invite":
                options.update(entryId=context.get("inviteEntryId"), teamName=context.get("inviteTeamName"), viaInvitation=context.get("directEntryInvitation", False))
            if action == "continue":
                pending = storage.get_choice(user_id, PENDING_KEY, 0)
                if not pending or pending.get("eventHex") != context["eventHex"]:
                    pending = _save_pending(storage, user_id, context, "choose", **options)
            else:
                pending = _save_pending(storage, user_id, context, action, **options)
            await _run_intent(callback.bot, state, api, settings, storage, user_id, chat_id, context, pending)
        elif action in {"applications", "applications-next", "applications-prev", "withdraw"}:
            if action == "withdraw":
                await api.user(user_id, "POST", tournament_api_path(context) + f"/participation/requests/{choice['requestId']}/cancel", {})
            result = await _participation(api, storage, user_id, context)
            if result.get("state") == "JOINED":
                await _show_status(callback.bot, api, settings, storage, user_id, chat_id, context, result)
                return
            applications = participation_requests(result)
            page = int(context.get("applicationPage") or 0)
            if action in {"applications-next", "applications-prev"}:
                page += 1 if action == "applications-next" else -1
            page = max(0, min(page, max(0, (len(applications) - 1) // 5)))
            context = save_tournament_context(storage, user_id, {"id": context["eventId"], **context}, applicationPage=page)
            visible = applications[page * 5:page * 5 + 5]
            choices = _save_action_choices(storage, user_id, [{"kind": "withdraw", "eventHex": context["eventHex"], "requestId": item["id"],
                "name": item.get("entryName") or "Команда"} for item in visible if uuid_hex(item.get("id"))])
            lines = ["📨 <b>Мои заявки</b>", "", "Первое принятие запишет тебя в команду и снимет остальные заявки.", ""]
            for item in visible:
                lines.append("• " + escape(str(item.get("entryName") or "Команда")[:40]) + " · " + ROLE_NAMES.get(str(item.get("role")), "без позиции"))
            if not applications:
                lines.append("Активных заявок нет.")
            rows = [[_button("Отозвать: " + str(item["name"])[:30], "withdraw", item["token"])] for item in choices]
            navigation = []
            if page:
                navigation.append(_button("← Заявки", "applications-prev", context["eventHex"]))
            if (page + 1) * 5 < len(applications):
                navigation.append(_button("Заявки →", "applications-next", context["eventHex"]))
            if navigation:
                rows.append(navigation)
            rows += [[_button("Выбрать команду", "solo", context["eventHex"])]] + _back(context["eventHex"])
            await _panel(callback.bot, storage, api, settings, user_id, chat_id, "applications", "\n".join(lines), rows)
        elif action in {"leave", "leave-confirm", "leave-cancel"}:
            from ..services.tournament_recruitment import refresh_linked_tournament_session
            await refresh_linked_tournament_session(api, storage, user_id)
            result = await _participation(api, storage, user_id, context)
            entry = result.get("entry") or {}
            if action == "leave-cancel" or result.get("state") != "JOINED":
                storage.set_choices(user_id, _ACTIONS_KEY, [])
                await _show_status(callback.bot, api, settings, storage, user_id, chat_id, context, result)
                return
            if not entry.get("canLeave"):
                raise ApiError("Выход из состава уже закрыт правилами турнира. Обратись к организатору.", 409)
            if action == "leave-confirm":
                if (choice.get("entryId") != entry.get("id") or choice.get("membershipId") != entry.get("membershipId")
                        or time.time() > choice.get("expiresAt", 0)):
                    raise ApiError("Подтверждение устарело или команда изменилась. Открой выход заново.", 409)
                await api.user(user_id, "DELETE", tournament_api_path(context) + f"/entries/{quote(str(entry['id']), safe='')}/members/me")
                storage.set_choices(user_id, _ACTIONS_KEY, [])
                _clear_pending(storage, user_id, context["eventHex"])
                result = await _participation(api, storage, user_id, context)
                await _panel(callback.bot, storage, api, settings, user_id, chat_id, "left",
                    "✅ <b>Ты вышел из команды</b>\n\n" + tournament_status_text(result),
                    tournament_status_keyboard(result, context, settings).inline_keyboard)
                return
            confirmation = _save_action_choices(storage, user_id, [{"kind": "leave-confirm", "eventHex": context["eventHex"],
                "entryId": entry["id"], "membershipId": entry["membershipId"], "expiresAt": time.time() + 120}])[0]
            text = "<b>Выйти из команды «" + escape(str(entry.get("name") or "Команда")[:80]) + "»?</b>\n\nТвоя позиция станет свободной."
            if entry.get("isCaptain"):
                text += "\nКапитанство перейдёт следующему игроку. Если ты один, состав будет снят с турнира."
            await _panel(callback.bot, storage, api, settings, user_id, chat_id, "leave",
                text, [[_button("Да, выйти из команды", "leave-confirm", confirmation["token"])],
                       [_button("Остаться в команде", "leave-cancel", context["eventHex"])]])
        elif action == "status":
            await _open_tournament(callback.bot, api, settings, storage, user_id, chat_id, context)
            await retire_legacy_tournament_notice(callback.bot, storage, user_id, callback.message, context)
        elif action == "team-settings":
            result = await _participation(api, storage, user_id, context)
            if settings_guard[0].revision != settings_guard[1]:
                return
            await _show_team_settings(callback.bot, api, settings, storage, user_id, chat_id, context, result)
        elif action == "cancel":
            result = await _participation(api, storage, user_id, context)
            if result.get("state") in {"WAITING", "REQUESTED"}:
                result = await api.user(user_id, "POST", tournament_api_path(context) + "/participation/cancel", {})
            _clear_pending(storage, user_id, context["eventHex"])
            await _show_status(callback.bot, api, settings, storage, user_id, chat_id, context, result)
        elif action == "web":
            result = await _participation(api, storage, user_id, context)
            entry_hex = uuid_hex((result.get("entry") or {}).get("id"))
            if result.get("state") != "JOINED" or not entry_hex:
                await _show_status(callback.bot, api, settings, storage, user_id, chat_id, context, result)
                return
            next_path = f"/games/tournaments/{quote(context['slug'], safe='')}/teams/{UUID(entry_hex)}#tournament-team-chat"
            url = await fresh_tournament_web_url(api, settings, user_id, next_path)
            rows = tournament_status_keyboard(result, context, settings).inline_keyboard
            rows[0] = [InlineKeyboardButton(text="💬 Открыть чат команды", url=url)]
            rows[-1][0] = _button("🔄 Обновить", "web", context["eventHex"])
            await _panel(callback.bot, storage, api, settings, user_id, chat_id, "web",
                         tournament_status_text(result), rows)
            if storage.is_temporary_message(chat_id, callback.message.message_id):
                try:
                    await callback.bot.delete_message(chat_id, callback.message.message_id)
                except TelegramAPIError:
                    storage.add_temporary_message(user_id, chat_id, callback.message.message_id, 0)
                else:
                    storage.remove_temporary_message(chat_id, callback.message.message_id)
            else:
                await retire_legacy_tournament_notice(callback.bot, storage, user_id, callback.message, context)
        elif action == "sponsor":
            result = await _participation(api, storage, user_id, context)
            sponsor = next((item for item in result.get("sponsors", []) if item.get("id") == choice["sponsorId"]), None)
            if sponsor is None:
                raise ApiError("Спонсор изменился. Обновите карточку турнира.")
            next_path = f"/games/tournaments/{quote(context['slug'], safe='')}?supporter={quote(str(sponsor['id']), safe='')}"
            url = await fresh_tournament_web_url(api, settings, user_id, next_path)
            await _panel(callback.bot, storage, api, settings, user_id, chat_id, "sponsor",
                         f"<b>{escape(str(sponsor.get('name') or 'Спонсор')[:80])}</b>\n\n"
                         "Откройте ссылку: сайт сохранит просмотр и перенаправит на страницу спонсора.",
                         [[InlineKeyboardButton(text="Открыть страницу спонсора", url=url)],
                          [_button("Я посмотрел — продолжить", "continue", context["eventHex"])]] + _back(context["eventHex"]))
        else:
            raise ApiError("Кнопка устарела. Откройте турнир заново.")
    except ApiError as error:
        if settings_guard and settings_guard[0].revision != settings_guard[1]:
            return
        retry = (tournament_callback("leave", context["eventHex"]) if action in {"leave", "leave-confirm"}
                 else callback.data if action in {"web", "sponsor", "status", "open", "preview", "teams", "teams-page", "teams-back", "search-settings", "manual", "team-settings"}
                 else tournament_callback("continue", context["eventHex"]))
        rows = [[InlineKeyboardButton(text="Попробовать ещё раз", callback_data=retry)]]
        pending = storage.get_choice(user_id, PENDING_KEY, 0) or {}
        if pending.get("eventHex") == context["eventHex"] and pending.get("action") == "join" and pending.get("entryId"):
            save_tournament_context(storage, user_id, {"id": context["eventId"], **context}, inviteEntryId=pending["entryId"])
            rows.append([_button("Выбрать другую позицию", "invite", context["eventHex"])])
        await _panel(callback.bot, storage, api, settings, user_id, chat_id, "error",
                     "<b>Не удалось продолжить участие</b>\n\n" + escape(str(error)),
                     rows + _back(context["eventHex"]))


@router.message(CommandStart(deep_link=True), F.text.regexp(r"^/start(?:@\w+)?\s+te_[a-fA-F0-9]{32}$"))
async def start_tournament_entry_invitation(message: Message, state: FSMContext, api: OpiniaApi,
                                            settings: Settings, storage: BotStorage) -> None:
    if message.from_user is None or message.chat.type != "private" or message.chat.id != message.from_user.id:
        return
    user_id = message.from_user.id
    storage.record_bot_user(user_id, "direct", display_name=message.from_user.full_name, username=message.from_user.username)
    entry_hex = (message.text or "").rsplit("te_", 1)[-1].lower()
    await state.clear()
    await begin_panel_transition(message.bot, storage, user_id, message.chat.id)
    try:
        invitation = await api.public("GET", f"/dota/tournaments/entry-links/{UUID(entry_hex)}")
        if uuid_hex(invitation.get("entryId")) != entry_hex or not invitation.get("slug"):
            raise ApiError("Приглашение недоступно. Откройте список турниров.")
        event_id = invitation.get("tournamentId")
        if not uuid_hex(event_id):
            event = next((item for item in await _events(api) if item["slug"] == invitation["slug"]), None)
            event_id = event.get("id") if event else None
        context = save_tournament_context(storage, user_id,
            {"id": event_id, "slug": invitation["slug"], "title": invitation.get("tournamentTitle")},
            inviteEntryId=str(UUID(entry_hex)), inviteTeamName=invitation.get("teamName"), directEntryInvitation=True)
        _save_pending(storage, user_id, context, "invite", entryId=str(UUID(entry_hex)),
                      teamName=invitation.get("teamName"), viaInvitation=True, telegramName=message.from_user.username or message.from_user.full_name)
        await _panel(message.bot, storage, api, settings, user_id, message.chat.id, "invitation",
                     f"🏆 <b>{escape(context['title'])}</b>\n\n"
                     f"Вас приглашают {'в компанию друзей' if invitation.get('companySearchEnabled') else 'в команду'} <b>{escape(str(invitation.get('teamName') or 'Команда')[:80])}</b>.\n\n"
                     "Нажмите кнопку и выберите позицию. Если профиля ещё нет, бот поможет заполнить MMR и роли.",
                     [[_button("🎮 Вступить в команду", "invite", context["eventHex"])]] + _back(context["eventHex"]))
    except ApiError as error:
        await _panel(message.bot, storage, api, settings, user_id, message.chat.id, "error",
                     "<b>Не удалось открыть приглашение</b>\n\n" + escape(str(error)),
                     [[InlineKeyboardButton(text="Открыть турниры", callback_data="tournaments:list")]])
    try:
        await message.delete()
    except TelegramAPIError:
        pass


async def resume_pending_tournament(bot, state: FSMContext, api: OpiniaApi, settings: Settings,
                                    storage: BotStorage, user_id: int, chat_id: int | None,
                                    match_wakeup=None) -> bool:
    """Resume an explicit tournament action after profile completion or linking."""
    if chat_id is not None and chat_id != user_id:
        return False
    pending = storage.get_choice(user_id, PENDING_KEY, 0)
    if not pending or not pending.get("eventHex"):
        return False
    try:
        context = load_tournament_context(storage, user_id, pending["eventHex"])
        if pending.get("slug") != context["slug"] or uuid_hex(pending.get("eventId")) != context["eventHex"]:
            raise ApiError("Турнир изменился. Откройте список заново.")
        _clear_pending_ordinary_intent(storage, user_id)
        await _run_intent(bot, state, api, settings, storage, user_id, chat_id or user_id, context, pending)
    except ApiError as error:
        await _panel(bot, storage, api, settings, user_id, chat_id or user_id, "error",
                     "<b>Участие в турнире сохранено</b>\n\n" + escape(str(error)),
                     [[InlineKeyboardButton(text="Открыть турниры", callback_data="tournaments:list")]])
    return True
