import logging
import time
from html import escape
from urllib.parse import quote

from aiogram import F, Router
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup
from aiogram.fsm.context import FSMContext

from ..api.client import ApiError, OpiniaApi
from ..config import Settings
from ..services.callbacks import acknowledge_callback
from ..services.panel import begin_panel_transition, edit_panel, edit_panel_content
from ..storage.database import BotStorage
from ..services.party_notifications import deliver_join_hint, deliver_member_joined_notice
from ..services.temporary_notifications import send_temporary_notification
from ..ui.keyboards import back_keyboard, invite_keyboard
from ..ui.formatters import notification_text
from ..services.auto_matcher import remember_declined_target
from ..services.party_ready import expire_ready_notice
from ..services.party_coordination import own_member, read_coordination

router = Router(name="party")
logger = logging.getLogger(__name__)
PARTY_INVITATION_MESSAGE_TTL_SECONDS = 3 * 60 * 60


@router.callback_query(F.data.regexp(r"^party:status:[a-f0-9]{20}:[1-5]$"))
async def view_party_readiness(callback: CallbackQuery, api: OpiniaApi, storage: BotStorage) -> None:
    if callback.message is None or callback.message.chat.type != "private":
        return
    _, _, token, role = (callback.data or "").split(":")
    context = storage.get_choice(callback.from_user.id, "party_coordination_token:" + token, 0)
    if not isinstance(context, dict):
        await callback.answer("Открой свою пати заново.", show_alert=True)
        return
    try:
        coordination = await read_coordination(api, callback.from_user.id, context["partySlug"])
        if coordination["id"] != context["partyId"] or own_member(coordination)["membershipId"] != context["membershipId"]:
            raise ApiError("Состав изменился", 409)
        member = next((item for item in coordination["members"] if str(item.get("positionRole")) == role), None)
        text = "Место уже свободно." if member is None else str(member["displayName"])[:40] + (": готов играть ✅" if member.get("readyAt") else ": ещё не подтвердил готовность ❌")
        await callback.answer(text, show_alert=True)
    except ApiError:
        await callback.answer("Не удалось проверить готовность. Открой пати заново.", show_alert=True)


@router.callback_query(F.data.regexp(r"^party:(?:ready|contact):[a-f0-9]{20}:(?:on|off)$"))
async def update_party_coordination(callback: CallbackQuery, api: OpiniaApi, settings: Settings, storage: BotStorage, state: FSMContext | None = None) -> None:
    if callback.message is None or callback.message.chat.type != "private":
        return
    _, action, token, toggle = (callback.data or "").split(":")
    context = storage.get_choice(callback.from_user.id, "party_coordination_token:" + token, 0)
    if not isinstance(context, dict):
        await callback.answer("Кнопка устарела. Открой свою пати заново.", show_alert=True)
        return
    acknowledge_callback(callback)
    suffix = "ready" if action == "ready" else "telegram-contact"
    body = {"membershipId": context["membershipId"], "ready" if action == "ready" else "visible": toggle == "on"}
    try:
        result = await api.user(callback.from_user.id, "POST" if action == "ready" else "PATCH",
                                f"/social/parties/{quote(context['partySlug'], safe='')}/members/me/{suffix}", body)
        if action == "ready":
            self_member = next((member for member in result.get("members", []) if member.get("isSelf")), None)
            if self_member is None or bool(self_member.get("readyAt")) != (toggle == "on"):
                raise ApiError("Не удалось подтвердить готовность", 503)
        if action == "ready" and toggle == "on":
            expire_ready_notice(storage, callback.from_user.id, token)
            panel = storage.get_panel(callback.from_user.id)
            clicked_id = getattr(callback.message, "message_id", None)
            if isinstance(clicked_id, int) and (panel is None or panel.message_id != clicked_id):
                storage.add_temporary_message(callback.from_user.id, callback.message.chat.id, clicked_id, 1)
        if state is not None:
            await state.clear()
        panel = storage.get_panel(callback.from_user.id)
        screen = "party_settings" if action == "contact" and panel and panel.screen == "party_settings" else "party"
        await edit_panel(callback.bot, storage, api, settings, callback.from_user.id, screen)
    except ApiError as error:
        if error.status in {403, 404, 409}:
            expire_ready_notice(storage, callback.from_user.id, token)
            text = "Состав пати изменился. Открой свою пати заново."
        else:
            text = "Не получилось сохранить изменение. Попробуй нажать кнопку ещё раз."
        await send_temporary_notification(callback.bot, storage, callback.from_user.id, callback.message.chat.id, text, 15)


@router.callback_query(F.data.regexp(r"^invite:[^:]+:(?:accept|decline)$"))
async def resolve_invite(
    callback: CallbackQuery,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    parts = (callback.data or "").split(":")
    if len(parts) != 3 or parts[2] not in {"accept", "decline"}:
        await callback.answer("Приглашение не найдено", show_alert=True)
        return
    _, invite_id, action = parts
    acknowledge_callback(callback)
    await begin_panel_transition(callback.bot, storage, callback.from_user.id, callback.message.chat.id if callback.message else None)
    try:
        before = await api.user(callback.from_user.id, "GET", "/social/parties/me")
        invite_before = next(
            (item for item in (before.get("invites", []) + before.get("outgoingInvites", [])) if item.get("id") == invite_id),
            None,
        )
        result = await api.user(
            callback.from_user.id,
            "POST",
            f"/social/parties/invites/{invite_id}/{action}",
        )
        if (
            action == "accept"
            and invite_before
            and invite_before.get("direction") == "incoming"
            and invite_before.get("inviteKind") == "INVITE"
            and result.get("slug")
        ):
            await deliver_join_hint(
                callback.bot, api, storage, callback.from_user.id, settings.site_url, result["slug"]
            )
        if callback.message:
            try:
                await callback.message.delete()
            except Exception:
                pass
        parties_after = await api.user(callback.from_user.id, "GET", "/social/parties/me")
        active_after = parties_after.get("party") or ((parties_after.get("parties") or [None])[-1])
        screen = "party" if active_after else "home"
        await edit_panel(callback.bot, storage, api, settings, callback.from_user.id, screen)
    except ApiError as error:
        await edit_panel_content(
            callback.bot,
            storage,
            api,
            settings,
            callback.from_user.id,
            "notice",
            f"<b>Не получилось обработать приглашение</b>\n\n{escape(str(error))}",
            back_keyboard(),
            callback.message.chat.id if callback.message else None,
        )


async def send_party_notification(bot, settings, storage, api, row: dict) -> bool:
    telegram_user_id = int(row["telegramUserId"])
    payload = row.get("payload") or {}
    event_type = payload.get("type")
    invite = payload.get("invite") or {}
    invite_id = invite.get("id")
    try:
        if event_type == "tournament_match_mention":
            title = escape(str(payload.get("tournamentTitle") or "Турнир"))
            author = escape(str(payload.get("author") or "Участник матча"))
            teams = escape(str(payload.get("teams") or ""))
            text = escape(str(payload.get("message") or ""))
            slug = quote(str(payload.get("tournamentSlug") or ""), safe="")
            match_id = quote(str(payload.get("matchId") or ""), safe="")
            url = f"{settings.site_url.rstrip('/')}/games/tournaments/{slug}/matches/{match_id}#match-chat"
            await bot.send_message(
                telegram_user_id,
                f"💬 <b>Тебя упомянули в чате матча</b>\n\n<b>{title}</b>\n{teams}\n\n<b>{author}</b>:\n{text}",
                parse_mode="HTML",
                reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
                    InlineKeyboardButton(text="Открыть чат матча", url=url)
                ]]),
            )
            return True
        if event_type == "party_updated":
            parties = await api.user(telegram_user_id, "GET", "/social/parties/me")
            active = parties.get("party") or ((parties.get("parties") or [None])[-1])
            # Membership is authoritative: a delayed event for an old party
            # must not replace the user's current party panel with the home screen.
            screen = "party" if active else "home"
            await edit_panel(bot, storage, api, settings, telegram_user_id, screen)
            if active and active.get("kind") == "PARTY" and active.get("memberCount", 0) > 1:
                await deliver_join_hint(bot, api, storage, telegram_user_id, settings.site_url, active["slug"])
            return True
        if event_type == "site_party_match":
            activity = payload.get("activity")
            party_name = escape(str(payload.get("partyName") or "пати"))
            if payload.get("clearSearch"):
                storage.clear_auto_match_exclusions(telegram_user_id)
                storage.record_party_joined(telegram_user_id, completes_search=True)
                try:
                    parties = await api.user(telegram_user_id, "GET", "/social/parties/me")
                    active = parties.get("party") or ((parties.get("parties") or [None])[-1])
                    if (
                        active
                        and active.get("slug") == payload.get("partySlug")
                        and active.get("canManageParty")
                        and active.get("recruitedRoles")
                    ):
                        storage.set_choices(
                            telegram_user_id,
                            "auto_search",
                            [
                                {
                                    "mode": "recruit",
                                    "partySlug": active["slug"],
                                    "roles": active["recruitedRoles"],
                                    "startedAt": time.time(),
                                }
                            ],
                        )
                    else:
                        storage.set_choices(telegram_user_id, "auto_search", [])
                except Exception:
                    storage.set_choices(telegram_user_id, "auto_search", [])
            try:
                await edit_panel(bot, storage, api, settings, telegram_user_id, "party")
            except Exception:
                logger.warning(
                    "Could not refresh party panel before website match notification",
                    exc_info=True,
                )
            if activity == "solo_group":
                message_text = (
                    f"🎮 Пати нашлась! Вы в стаке «<b>{party_name}</b>» вместе с игроком, который искал на сайте FDP.\n"
                    "Откройте сайт, чтобы посмотреть состав пати и перейти в чат или Discord."
                )
            else:
                await deliver_member_joined_notice(
                    bot,
                    api,
                    storage,
                    telegram_user_id,
                    settings.site_url,
                    str(payload.get("partySlug") or ""),
                    f"🎮 В пати «<b>{party_name}</b>» вступил игрок из поиска на сайте.",
                )
                return True
            await deliver_join_hint(
                bot,
                api,
                storage,
                telegram_user_id,
                settings.site_url,
                str(payload.get("partySlug") or ""),
                message_text=message_text,
            )
            return True
        if event_type == "declined":
            remember_declined_target(storage, telegram_user_id, payload)
        if event_type == "member_joined":
            try:
                await edit_panel(bot, storage, api, settings, telegram_user_id, "party")
            except Exception:
                logger.warning(
                    "Could not refresh party panel before roster notification",
                    exc_info=True,
                )
            await deliver_member_joined_notice(
                bot,
                api,
                storage,
                telegram_user_id,
                settings.site_url,
                str(invite.get("partySlug") or payload.get("partySlug") or ""),
                notification_text(payload),
            )
            return True
        if event_type in {"member_left", "member_kicked"}:
            try:
                await edit_panel(bot, storage, api, settings, telegram_user_id, "party")
            except Exception:
                logger.warning(
                    "Could not refresh party panel before roster notification",
                    exc_info=True,
                )
            await send_temporary_notification(
                bot,
                storage,
                telegram_user_id,
                telegram_user_id,
                notification_text(payload),
                10,
                parse_mode="HTML",
            )
            storage.record_party_notification(telegram_user_id)
            return True
        if event_type == "accepted":
            party_slug = invite.get("partySlug")
            if party_slug:
                await deliver_join_hint(
                    bot, api, storage, telegram_user_id, settings.site_url, party_slug
                )
            else:
                await send_temporary_notification(
                    bot,
                    storage,
                    telegram_user_id,
                    telegram_user_id,
                    notification_text(payload),
                    10,
                )
                storage.record_party_notification(telegram_user_id)
            return True

        markup = invite_keyboard(invite_id, invite.get("inviteKind", "INVITE")) if invite_id and event_type in {"invite_received", "application_received"} else None
        message = await bot.send_message(
            telegram_user_id,
            notification_text(payload),
            reply_markup=markup,
            parse_mode="HTML",
        )
        if event_type in {"invite_received", "application_received"}:
            # Match the three-hour pending invitation lifetime in the party service.
            storage.add_temporary_message(
                telegram_user_id,
                message.chat.id,
                message.message_id,
                PARTY_INVITATION_MESSAGE_TTL_SECONDS,
            )
        else:
            storage.add_temporary_message(telegram_user_id, message.chat.id, message.message_id, 300)
        storage.record_party_notification(telegram_user_id)
        return True
    except Exception:
        return False
