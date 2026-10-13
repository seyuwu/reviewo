from html import escape
from urllib.parse import quote
from uuid import UUID

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from ..api.client import ApiError
from ..services.callbacks import acknowledge_callback
from ..services.panel import edit_panel, edit_panel_content
from ..services.tournament_recruitment import consume_recruit_invite, refresh_linked_tournament_session
from ..services.tournament_participation import ROLE_NAMES, fresh_tournament_web_url, load_tournament_context, save_tournament_context, tournament_api_path
from .tournaments import _action_choice, _button, _private_callback, _save_action_choices, _show_status, _participation

router = Router(name="tournament-recruitment")


async def show_recruitment(callback, api, settings, storage, context, board):
    page = max(0, min(int(context.get("recruitPage") or 0), max(0, (len(board.get("players", [])) - 1) // 3)))
    players = board.get("players", [])[page * 3:page * 3 + 3] if board.get("enabled") else []
    choices = _save_action_choices(storage, callback.from_user.id, [
        {"kind": "recruit-player", "eventHex": context["eventHex"], "entryId": board["entryId"],
         "queueId": player["queueId"], "generation": player["generation"], "positions": player.get("positions", []), "name": player["name"]}
        for player in players])
    text = f"🏆 <b>{escape(context['title'])}</b>\n<b>{escape(str(board['name'])[:70])}</b>\n\n"
    rows = []
    if not board.get("needed"):
        text += "Состав полный или набор уже завершён."
    elif not board.get("enabled"):
        text += "Нажми «Ищем игроков»: покажем тех, кто ищет команду сейчас, и будем сообщать о новых."
        rows.append([_button("Ищем игроков", "recruit-start", context["eventHex"])])
    else:
        text += "<b>Поиск игроков включён</b>\nУведомления относятся только к этому турниру.\n\n"
        if not players:
            text += "Подходящих игроков пока нет. Сообщим, когда кто-нибудь начнёт поиск."
        for player in players:
            roles = ", ".join(ROLE_NAMES.get(str(role), str(role)) for role in player.get("roles", []))
            mmr = player.get("mmr")
            text += f"• <b>{escape(str(player['name'])[:32])}</b> · {escape(str(mmr if mmr is not None else '—'))} MMR\n{escape(roles)}\n"
            choice = next(item for item in choices if item["queueId"] == player["queueId"])
            rows.append([_button("Пригласить " + str(player["name"])[:24], "recruit-player", choice["token"])])
        navigation = []
        if page:
            navigation.append(_button("← Игроки", "recruit-prev", context["eventHex"]))
        if (page + 1) * 3 < len(board.get("players", [])):
            navigation.append(_button("Игроки →", "recruit-next", context["eventHex"]))
        if navigation:
            rows.append(navigation)
        rows.append([_button("Остановить поиск игроков", "recruit-stop", context["eventHex"])])
    rows += [[_button("Обновить", "recruits", context["eventHex"]), _button("← Команда", "status", context["eventHex"])]]
    await edit_panel_content(callback.bot, storage, api, settings, callback.from_user.id, "tournaments:recruitment", text,
                             InlineKeyboardMarkup(inline_keyboard=rows), callback.message.chat.id)


@router.callback_query(F.data.regexp(r"^tr:(?:recruits|recruit-start|recruit-stop|recruit-player|recruit-send|recruit-next|recruit-prev|positions|pos-toggle|pos-save):[a-f0-9]{32}(?::[1-5])?$"))
async def recruitment_action(callback, state: FSMContext, api, settings, storage):
    if not await _private_callback(callback):
        return
    action, token = callback.data.split(":")[1:3]
    try:
        choice = _action_choice(storage, callback.from_user.id, token, action) if action in {"recruit-send", "recruit-player"} else None
        context = load_tournament_context(storage, callback.from_user.id, choice["eventHex"] if choice else token)
        acknowledge_callback(callback)
        await refresh_linked_tournament_session(api, storage, callback.from_user.id)
        await state.clear()
        result = await _participation(api, storage, callback.from_user.id, context)
        if action in {"positions", "pos-toggle", "pos-save"}:
            if result.get("state") != "WAITING":
                await _show_status(callback.bot, api, settings, storage, callback.from_user.id, callback.message.chat.id, context, result)
                return
            roles = context.get("searchRoleDraft") if action != "positions" else result.get("queueRoles", [])
            roles = [str(role) for role in (roles or []) if str(role) in ROLE_NAMES]
            if action == "pos-toggle":
                selected = callback.data.split(":")[-1]
                roles = [role for role in roles if role != selected] if selected in roles else roles + [selected]
            if action == "pos-save":
                if not roles:
                    raise ApiError("Выбери хотя бы одну позицию.")
                result = await api.user(callback.from_user.id, "POST", tournament_api_path(context) + "/participation/solo",
                                        {"roles": roles, "mode": result.get("queueMode") or "BOARD"})
                await _show_status(callback.bot, api, settings, storage, callback.from_user.id, callback.message.chat.id, context, result)
                return
            save_tournament_context(storage, callback.from_user.id, {"id": context["eventId"], **context}, searchRoleDraft=roles)
            rows = [[_button(("✓ " if role in roles else "") + name, "pos-toggle", context["eventHex"], role)] for role, name in ROLE_NAMES.items()]
            rows += [[_button("Сохранить позиции поиска", "pos-save", context["eventHex"])], [_button("← Поиск команды", "solo", context["eventHex"])]]
            await edit_panel_content(callback.bot, storage, api, settings, callback.from_user.id, "tournaments:positions",
                                     "<b>Позиции для турнира</b>\n\nВыбери любые удобные позиции. Роли профиля не изменятся.", InlineKeyboardMarkup(inline_keyboard=rows), callback.message.chat.id)
            return
        entry = result.get("entry") or {}
        if not entry.get("isCaptain"):
            raise ApiError("Поиск игроков доступен капитану команды.", 403)
        path = tournament_api_path(context) + "/entries/" + quote(str(entry["id"]), safe="") + "/recruitment"
        if action == "recruit-player":
            if choice["entryId"] != entry["id"]:
                raise ApiError("Команда уже изменилась. Обнови игроков.", 409)
            positions = _save_action_choices(storage, callback.from_user.id, [
                {**choice, "kind": "recruit-send", "role": str(role)} for role in choice.get("positions", []) if str(role) in ROLE_NAMES])
            rows = [[_button(ROLE_NAMES[item["role"]], "recruit-send", item["token"]) for item in positions[index:index+3]] for index in range(0, len(positions), 3)]
            rows.append([_button("← Игроки", "recruits", context["eventHex"])])
            await edit_panel_content(callback.bot, storage, api, settings, callback.from_user.id, "tournaments:recruit-position",
                "<b>Пригласить " + escape(str(choice["name"])[:40]) + "</b>\n\nВыбери свободную позицию для приглашения.", InlineKeyboardMarkup(inline_keyboard=rows), callback.message.chat.id)
            return
        if action == "recruit-send":
            if choice["entryId"] != entry["id"]:
                raise ApiError("Команда уже изменилась. Обнови игроков.", 409)
            await api.user(callback.from_user.id, "POST", path + "/invite", {"queueId": choice["queueId"], "generation": choice["generation"], "positionRole": choice["role"]})
            board = await api.user(callback.from_user.id, "GET", path)
            await show_recruitment(callback, api, settings, storage, context, board)
            await callback.answer("Приглашение отправлено игроку.")
            return
        if action in {"recruit-next", "recruit-prev"}:
            context = save_tournament_context(storage, callback.from_user.id, {"id": context["eventId"], **context},
                recruitPage=max(0, int(context.get("recruitPage") or 0) + (1 if action == "recruit-next" else -1)))
        board = await api.user(callback.from_user.id, "POST", path + "/search", {"enabled": action == "recruit-start"}) if action in {"recruit-start", "recruit-stop"} else await api.user(callback.from_user.id, "GET", path)
        await show_recruitment(callback, api, settings, storage, context, board)
    except ApiError as error:
        await callback.answer(str(error), show_alert=True)


@router.callback_query(F.data.regexp(r"^(?:tinvite|tinviteweb|taccept):[a-f0-9]{32}$"))
async def tournament_recruit_invitation(callback, state: FSMContext, api, settings, storage):
    if not await _private_callback(callback):
        return
    action, token = callback.data.split(":")
    context, saved, notice_token = None, None, token
    try:
        acknowledge_callback(callback)
        await refresh_linked_tournament_session(api, storage, callback.from_user.id)
        await state.clear()
        if action == "taccept":
            choice = _action_choice(storage, callback.from_user.id, token, "recruit-accept")
            context = load_tournament_context(storage, callback.from_user.id, choice["eventHex"])
            saved = storage.get_choice(callback.from_user.id, "tournament_recruit_invite:" + UUID(choice["noticeId"]).hex, 0)
            await api.user(callback.from_user.id, "POST", tournament_api_path(context) + f"/participation/invites/{choice['noticeId']}/accept", {"positionRole": choice["role"]})
            result = await _participation(api, storage, callback.from_user.id, context)
            await _show_status(callback.bot, api, settings, storage, callback.from_user.id, callback.message.chat.id, context, result)
            await consume_recruit_invite(callback.bot, storage, callback.from_user.id, UUID(choice["noticeId"]).hex)
            return
        notice_id = str(UUID(token))
        # A private notice stores its event context, never a URL supplied by a recipient.
        saved = storage.get_choice(callback.from_user.id, "tournament_recruit_invite:" + token, 0)
        if not saved:
            raise ApiError("Приглашение устарело. Открой поиск команды снова.")
        context = load_tournament_context(storage, callback.from_user.id, saved["eventHex"])
        invitation = await api.user(callback.from_user.id, "GET", tournament_api_path(context) + f"/participation/invites/{notice_id}")
        storage.set_choices(callback.from_user.id, "tournament_recruit_invite:" + token, [{**saved,
            "entryId": invitation["entryId"], "expiresAt": invitation.get("expiresAt")}])
        if action == "tinviteweb":
            url = await fresh_tournament_web_url(api, settings, callback.from_user.id,
                f"/games/tournaments/{quote(context['slug'], safe='')}?participate=1&recruitInvite={notice_id}")
            rows = [[InlineKeyboardButton(text="🌐 Открыть приглашение на сайте", url=url)],
                [InlineKeyboardButton(text="← Приглашение в боте", callback_data="tinvite:" + token)]]
            await edit_panel(callback.bot, storage, api, settings, callback.from_user.id, "tournaments:recruit-invitation-site",
                callback.message.chat.id, content=("Приглашение в «" + escape(str(invitation['name'])[:80]) + "». Открой сайт по кнопке ниже.",
                    InlineKeyboardMarkup(inline_keyboard=rows)), force_new_message=True)
            await consume_recruit_invite(callback.bot, storage, callback.from_user.id, token, callback.message.message_id)
            return
        choices = _save_action_choices(storage, callback.from_user.id, [
            {"kind": "recruit-accept", "eventHex": context["eventHex"], "noticeId": notice_id, "role": str(role)} for role in invitation.get("roles", []) if str(role) in ROLE_NAMES])
        rows = [[InlineKeyboardButton(text="Вступить · " + ROLE_NAMES[choice["role"]], callback_data="taccept:" + choice["token"])] for choice in choices]
        username = getattr(settings, "main_bot_username", "FDPdotabot")
        rows += [[InlineKeyboardButton(text="Посмотреть на сайте", callback_data="tinviteweb:" + token)],
            [InlineKeyboardButton(text="🔗 Ссылка команды", url=f"https://t.me/{username}?start=te_{UUID(invitation['entryId']).hex}")],
            [_button("← Поиск команды", "solo", context["eventHex"])]]
        text = (f"<b>{escape(str(invitation['name'])[:80])}</b>\n\nКапитан {escape(str(invitation['senderName'])[:50])} приглашает тебя в состав.\n"
            "Выбери позицию и вступи — повторная заявка не нужна.")
        await edit_panel(callback.bot, storage, api, settings, callback.from_user.id, "tournaments:recruit-invitation",
            callback.message.chat.id, content=(text, InlineKeyboardMarkup(inline_keyboard=rows)), force_new_message=True)
        await consume_recruit_invite(callback.bot, storage, callback.from_user.id, token, callback.message.message_id)
    except ApiError as error:
        await callback.answer(str(error), show_alert=True)
        if error.status in {403, 404, 409} and context:
            if action == "taccept":
                notice_token = UUID(choice["noticeId"]).hex
            await consume_recruit_invite(callback.bot, storage, callback.from_user.id, notice_token)
            result = await _participation(api, storage, callback.from_user.id, context)
            if saved and saved.get("entryId") and result.get("state") not in {"JOINED", "CLOSED"}:
                username = getattr(settings, "main_bot_username", "FDPdotabot")
                rows = [[InlineKeyboardButton(text="🔗 Вступить по ссылке команды", url=f"https://t.me/{username}?start=te_{UUID(saved['entryId']).hex}")],
                    [_button("👥 Выбрать другую команду", "solo", context["eventHex"])]]
                await edit_panel_content(callback.bot, storage, api, settings, callback.from_user.id, "tournaments:expired-invitation",
                    "Приглашение больше не действует. Если в составе есть свободная позиция, можешь вступить по ссылке команды.",
                    InlineKeyboardMarkup(inline_keyboard=rows), callback.message.chat.id)
            else:
                await _show_status(callback.bot, api, settings, storage, callback.from_user.id, callback.message.chat.id, context, result)
