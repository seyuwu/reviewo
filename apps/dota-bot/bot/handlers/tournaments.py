"""Private Telegram tournament onboarding, entry invitations and participation."""

import logging
import re
from datetime import datetime
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
from ..services.tournament_participation import (
    PENDING_KEY, ROLE_NAMES, fresh_tournament_web_url,
    load_tournament_context, remember_participation, save_tournament_context,
    tournament_api_path, tournament_callback, tournament_status_keyboard,
    tournament_status_text, uuid_hex,
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
    return [[_button("← К турниру", "open", event_hex)]] if event_hex else [
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
    if not value:
        return "Дата будет объявлена"
    try:
        date = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return date.strftime("%d.%m %H:%M") + (" UTC" if date.utcoffset() is not None and date.utcoffset().total_seconds() == 0 else "")
    except ValueError:
        return str(value)[:40]


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
    await edit_panel_content(bot, storage, api, settings, user_id, "tournaments:status",
                             tournament_status_text(result), tournament_status_keyboard(result, context, settings), chat_id)


async def _show_modes(bot, api, settings, storage, user_id, chat_id, context) -> None:
    await _panel(bot, storage, api, settings, user_id, chat_id, "choose",
                 f"🏆 <b>{escape(context['title'])}</b>\n\nКак будете участвовать?",
                 [[_button("Я один — подобрать команду", "solo", context["eventHex"])],
                  [_button("Мы с друзьями", "friends", context["eventHex"])]] + _back(context["eventHex"]))


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
    suggestions = [suggestion for suggestion in result.get("suggestions", [])
                   if str(suggestion.get("role")) in ROLE_NAMES and uuid_hex(suggestion.get("entryId"))][:3]
    choices = _save_action_choices(storage, user_id, [
        {"kind": "join", "eventHex": context["eventHex"], "entryId": str(UUID(str(item["entryId"]))),
         "role": str(item["role"])} for item in suggestions
    ])
    lines = [f"🏆 <b>{escape(context['title'])}</b>", "", "<b>Подберём команду для турнира</b>"]
    rows = []
    for item, choice in zip(suggestions, choices):
        name = str(item.get("name") or "Команда")[:55]
        role = ROLE_NAMES[choice["role"]]
        mmr = item.get("averageMmr")
        lines.append(f"• {escape(name)} · {escape(str(item.get('memberCount', 0)))}/5 · {role}"
                     + (f" · {escape(str(mmr))} MMR" if mmr is not None else ""))
        rows.append([_button(f"{name} · {role}", "join", choice["token"])])
    lines += ["", "Выберите готовую команду или запустите подбор. Бот сообщит, когда найдётся состав."]
    rows += [[_button("Подобрать автоматически", "queue", context["eventHex"])]] + _back(context["eventHex"])
    await _panel(bot, storage, api, settings, user_id, chat_id, "solo", "\n".join(lines), rows)


async def _show_friends(bot, api, settings, storage, user_id, chat_id, context, result) -> None:
    roles = [str(role) for role in result.get("roles", []) if str(role) in ROLE_NAMES]
    role = context.get("friendsRole") if context.get("friendsRole") in ROLE_NAMES else (roles or ["1"])[0]
    context = save_tournament_context(storage, user_id, result["tournament"], friendsRole=role)
    rows = [[_button("Создать команду и пригласить друзей", "create", context["eventHex"])],
            [_button(("✓ " if selected == role else "") + ROLE_NAMES[selected], "role", context["eventHex"], selected)
             for selected in ("1", "2", "3")],
            [_button(("✓ " if selected == role else "") + ROLE_NAMES[selected], "role", context["eventHex"], selected)
             for selected in ("4", "5")]]
    teams = []
    try:
        parties = await api.user(user_id, "GET", "/social/parties/me")
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
    await _panel(bot, storage, api, settings, user_id, chat_id, "friends",
                 f"🏆 <b>{escape(context['title'])}</b>\n\n"
                 f"Ваша позиция: <b>{ROLE_NAMES[role]}</b>. Можно выбрать другую.\n\n"
                 "Создадим команду для этого турнира и дадим ссылку для друзей. Название появится автоматически.", rows)


async def _show_invite_roles(bot, api, settings, storage, user_id, chat_id, context, pending) -> None:
    tournament = await api.user(user_id, "GET", tournament_api_path(context))
    entry = next((entry for entry in tournament.get("entries", [])
                  if uuid_hex(entry.get("id")) == uuid_hex(pending.get("entryId"))), None)
    if not entry or entry.get("status") not in {"RECRUITING", "RESERVE"}:
        raise ApiError("Команда уже завершила набор. Выберите другой вариант участия.")
    occupied = {str(member.get("positionRole", member.get("role"))) for member in entry.get("members", [])}
    roles = [role for role in ROLE_NAMES if role not in occupied]
    choices = _save_action_choices(storage, user_id, [
        {"kind": "join", "eventHex": context["eventHex"], "entryId": pending["entryId"], "role": role}
        for role in roles
    ])
    rows = [[_button("🎮 " + ROLE_NAMES[choice["role"]], "join", choice["token"])] for choice in choices]
    name = escape(str(entry.get("teamName") or pending.get("teamName") or "Команда")[:80])
    text = f"🏆 <b>{escape(context['title'])}</b>\n\n<b>{name}</b>\n\n"
    text += "Выберите свободную позицию и вступите в команду." if roles else "Свободных мест сейчас нет."
    if entry.get("joinMode") == "CONFIRM":
        text += "\nКапитан подтвердит вашу заявку."
    await _panel(bot, storage, api, settings, user_id, chat_id, "invite", text, rows + _back(context["eventHex"]))


async def _run_intent(bot, state, api, settings, storage, user_id, chat_id, context, pending) -> None:
    if not await _ensure_profile(bot, state, api, settings, storage, user_id, chat_id, pending):
        return
    result = await _participation(api, storage, user_id, context)
    if result.get("state") in {"JOINED", "REQUESTED", "CLOSED"}:
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
        result = await api.user(user_id, "POST", tournament_api_path(context) + "/participation/solo", {})
        await _show_status(bot, api, settings, storage, user_id, chat_id, context, result)
    elif action == "create":
        role = str(pending.get("role") or context.get("friendsRole") or (result.get("roles") or ["1"])[0])
        if role not in ROLE_NAMES:
            raise ApiError("Выберите позицию для команды.")
        await api.user(user_id, "POST", tournament_api_path(context) + "/squads",
                       {"positionRole": role, "joinMode": "OPEN"})
        result = await _participation(api, storage, user_id, context)
        await _show_status(bot, api, settings, storage, user_id, chat_id, context, result)
    elif action == "join":
        entry_hex = uuid_hex(pending.get("entryId"))
        if not entry_hex or pending.get("role") not in ROLE_NAMES:
            raise ApiError("Приглашение устарело. Откройте его заново.")
        await api.user(user_id, "POST", tournament_api_path(context) + f"/entries/{UUID(entry_hex)}/join",
                       {"positionRole": pending["role"]})
        result = await _participation(api, storage, user_id, context)
        await _show_status(bot, api, settings, storage, user_id, chat_id, context, result)
    elif action == "team":
        await api.user(user_id, "POST", tournament_api_path(context) + "/entries", {"teamSlug": pending["teamSlug"], "joinMode": "OPEN"})
        result = await _participation(api, storage, user_id, context)
        await _show_status(bot, api, settings, storage, user_id, chat_id, context, result)
    elif action == "friends":
        await _show_friends(bot, api, settings, storage, user_id, chat_id, context, result)
    elif action == "invite":
        await _show_invite_roles(bot, api, settings, storage, user_id, chat_id, context, pending)
    elif action == "solo":
        if result.get("state") == "WAITING":
            await _show_status(bot, api, settings, storage, user_id, chat_id, context, result)
        else:
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
    rows += [[InlineKeyboardButton(text="🌐 Страница турнира", url=f"{settings.site_url}/games/tournaments/{quote(context['slug'], safe='')}")],
             [InlineKeyboardButton(text="← Турниры", callback_data="tournaments:list")]]
    await _panel(bot, storage, api, settings, user_id, chat_id, "preview",
                 f"🏆 <b>{escape(context['title'])}</b>\n\n{escape(_date_text(event.get('startsAt')))}\n"
                 + escape(_STATUS_NAMES.get(event.get("status"), "Турнир")), rows)


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
        choice = _action_choice(storage, user_id, token, action) if action in {"join", "team", "sponsor"} else None
        context = load_tournament_context(storage, user_id, choice["eventHex"] if choice else token)
    except ApiError as error:
        await callback.answer(str(error), show_alert=True)
        return
    acknowledge_callback(callback)
    await begin_panel_transition(callback.bot, storage, user_id, chat_id)
    await _record_tournament_bot_started(api, storage, user_id)
    try:
        if action == "open":
            await _open_tournament(callback.bot, api, settings, storage, user_id, chat_id, context)
        elif action == "signup":
            _save_pending(storage, user_id, context, "choose",
                          telegramName=callback.from_user.username or callback.from_user.full_name)
            await _show_modes(callback.bot, api, settings, storage, user_id, chat_id, context)
        elif action in {"solo", "friends", "queue", "create", "invite", "join", "team", "continue", "role"}:
            options = {"telegramName": callback.from_user.username or callback.from_user.full_name}
            if action == "role":
                if len(parts) != 4 or parts[3] not in ROLE_NAMES:
                    raise ApiError("Выберите позицию из списка.")
                context = save_tournament_context(storage, user_id, {"id": context["eventId"], **context}, friendsRole=parts[3])
                action = "friends"
            elif action in {"join", "team"}:
                options.update({key: choice[key] for key in ("entryId", "role") if key in choice})
                if action == "team":
                    options["teamSlug"] = choice["teamSlug"]
            elif action == "create":
                options["role"] = context.get("friendsRole")
            elif action == "invite":
                options.update(entryId=context.get("inviteEntryId"), teamName=context.get("inviteTeamName"))
            if action == "continue":
                pending = storage.get_choice(user_id, PENDING_KEY, 0)
                if not pending or pending.get("eventHex") != context["eventHex"]:
                    pending = _save_pending(storage, user_id, context, "choose", **options)
            else:
                pending = _save_pending(storage, user_id, context, action, **options)
            await _run_intent(callback.bot, state, api, settings, storage, user_id, chat_id, context, pending)
        elif action == "status":
            await _open_tournament(callback.bot, api, settings, storage, user_id, chat_id, context)
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
            next_path = f"/games/tournaments/{quote(context['slug'], safe='')}/teams/{UUID(entry_hex)}"
            url = await fresh_tournament_web_url(api, settings, user_id, next_path)
            rows = [[InlineKeyboardButton(text="🌐 Открыть мою команду", url=url)],
                    [_button("Обновить ссылку входа", "web", context["eventHex"])]]
            rows += tournament_status_keyboard(result, context, settings).inline_keyboard[1:]
            await _panel(callback.bot, storage, api, settings, user_id, chat_id, "web",
                         tournament_status_text(result), rows)
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
        retry = callback.data if action in {"web", "sponsor", "status", "open"} else tournament_callback("continue", context["eventHex"])
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
            inviteEntryId=str(UUID(entry_hex)), inviteTeamName=invitation.get("teamName"))
        _save_pending(storage, user_id, context, "invite", entryId=str(UUID(entry_hex)),
                      teamName=invitation.get("teamName"), telegramName=message.from_user.username or message.from_user.full_name)
        await _panel(message.bot, storage, api, settings, user_id, message.chat.id, "invitation",
                     f"🏆 <b>{escape(context['title'])}</b>\n\n"
                     f"Вас приглашают в команду <b>{escape(str(invitation.get('teamName') or 'Команда')[:80])}</b>.\n\n"
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
