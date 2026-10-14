"""A company uses an existing squad and one membership-bound application."""
from html import escape
import re

from aiogram import F, Router

from ..api.client import ApiError
from ..services.callbacks import acknowledge_callback
from ..services.tournament_recruitment import refresh_linked_tournament_session
from ..services.tournament_participation import (
    ROLE_NAMES, load_tournament_context, tournament_api_path,
)
from .tournaments import _action_choice, _button, _panel, _participation, _private_callback, _save_action_choices, _show_status, _show_team_catalog, _show_team_settings

router = Router(name="tournament-companies")


@router.callback_query(F.data.regexp(r"^tr:company-(?:enable|confirm|teams|page|back|pick|apply|info):[a-f0-9]{32}(?::[0-9]{1,5})?$"))
async def company_action(callback, state, api, settings, storage):
    if not await _private_callback(callback):
        return
    _, action, token, *extra = callback.data.split(":")
    user_id, chat_id = callback.from_user.id, callback.message.chat.id
    context = None
    try:
        choice = None
        if action == "company-confirm":
            choice = storage.get_choice(user_id, "company_consent", 0)
            if not choice or choice.get("token") != token:
                raise ApiError("Кнопка устарела. Обнови компанию.")
        elif action in {"company-pick", "company-apply"}:
            choice = _action_choice(storage, user_id, token, action)
        context = load_tournament_context(storage, user_id, choice["eventHex"] if choice else token)
        acknowledge_callback(callback)
        await refresh_linked_tournament_session(api, storage, user_id)
        await state.clear()
        base = tournament_api_path(context) + "/participation/company"
        if action == "company-enable":
            result = await api.user(user_id, "POST", base, {})
            await _show_status(callback.bot, api, settings, storage, user_id, chat_id, context, result)
            return
        result = await _participation(api, storage, user_id, context)
        entry = result.get("entry") or {}
        company = entry.get("company")
        if not company:
            await _show_status(callback.bot, api, settings, storage, user_id, chat_id, context, result)
            return
        if action == "company-confirm":
            if entry["id"] != choice["entryId"]:
                raise ApiError("Компания изменилась. Обнови карточку.")
            result = await api.user(user_id, "POST", base + "/confirm", {
                "rosterVersion": choice["rosterVersion"], "confirmed": choice["confirmed"]})
            await _show_status(callback.bot, api, settings, storage, user_id, chat_id, context, result)
        elif action == "company-info":
            await _show_team_settings(callback.bot, api, settings, storage, user_id, chat_id, context, result)
        else:
            if not entry.get("isCaptain") or not company.get("confirmed"):
                raise ApiError("Дождись подтверждения друзей. Команду выбирает организатор компании.")
            if action in {"company-teams", "company-page", "company-back"}:
                page = int(context.get("companyCatalogPage") or 0) if action == "company-back" else 0
                if action == "company-page":
                    if not extra or not re.fullmatch(r"\d{1,5}", extra[0]) or int(extra[0]) > 10000:
                        raise ApiError("Открой список команд заново.")
                    page = int(extra[0])
                await _show_team_catalog(callback.bot, api, settings, storage, user_id, chat_id, context, page, company=True)
                return
            if choice.get("sourceEntryId") != entry["id"] or choice.get("rosterVersion") != company["rosterVersion"]:
                raise ApiError("Компания изменилась. Всем нужно подтвердить поиск заново.")
            if action == "company-apply":
                result = await api.user(user_id, "POST", base + "/applications/" + choice["entryId"], {"rosterVersion": choice["rosterVersion"]})
                await _show_status(callback.bot, api, settings, storage, user_id, chat_id, context, result)
                return
            tournament = await api.user(user_id, "GET", tournament_api_path(context))
            target = next((team for team in tournament.get("entries", []) if team.get("id") == choice["entryId"]), None)
            if not target:
                raise ApiError("Команда больше недоступна. Обнови список.")
            members = target.get("members", [])
            compatible = len(members) + len(entry["members"]) <= 5 and not any(
                member.get("positionRole") == own.get("role") for member in members for own in entry["members"])
            lines = ["👥 <b>Команда: " + escape(str(target.get("teamName") or "Команда")[:80]) + "</b>", ""]
            for member in members:
                lines.append("• " + escape(str(member.get("displayName") or "Игрок")[:35]) + " · "
                    + ROLE_NAMES.get(str(member.get("positionRole")), "без позиции") + " · "
                    + escape(str(member.get("mmr") if member.get("mmr") is not None else "—")) + " MMR")
            rows = []
            if any(request["entryId"] == target["id"] for request in company.get("requests", [])):
                lines += ["", "📨 Заявка на всю компанию уже отправлена. Ждём капитана."]
            elif compatible:
                lines += ["", f"Вы вступаете вместе: {len(entry['members'])} игрока. Капитан подтвердит заявку на всех.",
                    f"После вступления: {len(members) + len(entry['members'])}/5 игроков."]
                confirmation = _save_action_choices(storage, user_id, [{**choice, "kind": "company-apply"}])[0]
                rows.append([_button(f"📨 Подать заявку на всех · {len(entry['members'])}", "company-apply", confirmation["token"])])
            else:
                lines += ["", "Состав изменился — мест для всей компании больше нет."]
            rows.append([_button("← Другие команды", "company-back", context["eventHex"])])
            await _panel(callback.bot, storage, api, settings, user_id, chat_id, "company-target", "\n".join(lines), rows)
    except ApiError as error:
        rows = [[_button("Обновить компанию", "status", context["eventHex"])]] if context else []
        await _panel(callback.bot, storage, api, settings, user_id, chat_id, "company-error", escape(str(error)), rows)
