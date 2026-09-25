from aiogram import F, Router
from aiogram.types import CallbackQuery

from ..api.client import ApiError, OpiniaApi
from ..config import Settings
from ..services.panel import begin_panel_transition, edit_panel, edit_panel_content
from ..storage.database import BotStorage
from ..services.party_notifications import deliver_join_hint
from ..ui.keyboards import back_keyboard, invite_keyboard
from html import escape
from ..ui.formatters import notification_text
from ..services.auto_matcher import remember_declined_target

router = Router(name="party")


@router.callback_query(F.data.startswith("invite:"))
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
    await callback.answer()
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
        if event_type == "party_updated":
            parties = await api.user(telegram_user_id, "GET", "/social/parties/me")
            active = parties.get("party") or ((parties.get("parties") or [None])[-1])
            screen = "party" if active and active.get("slug") == payload.get("partySlug") else "home"
            await edit_panel(bot, storage, api, settings, telegram_user_id, screen)
            return True
        if event_type == "declined":
            remember_declined_target(storage, telegram_user_id, payload)
        if event_type == "member_joined":
            await edit_panel(bot, storage, api, settings, telegram_user_id, "party")
            message = await bot.send_message(
                telegram_user_id,
                notification_text(payload),
                parse_mode="HTML",
            )
            storage.add_temporary_message(telegram_user_id, message.chat.id, message.message_id, 8)
            return True
        if event_type in {"member_left", "member_kicked"}:
            await edit_panel(bot, storage, api, settings, telegram_user_id, "party")
            message = await bot.send_message(
                telegram_user_id,
                notification_text(payload),
                parse_mode="HTML",
            )
            storage.add_temporary_message(telegram_user_id, message.chat.id, message.message_id, 8)
            return True
        if event_type == "accepted":
            party_slug = invite.get("partySlug")
            if party_slug:
                await deliver_join_hint(
                    bot, api, storage, telegram_user_id, settings.site_url, party_slug
                )
            else:
                message = await bot.send_message(telegram_user_id, notification_text(payload))
                storage.add_temporary_message(telegram_user_id, message.chat.id, message.message_id, 10)
            return True

        markup = invite_keyboard(invite_id, invite.get("inviteKind", "INVITE")) if invite_id and event_type in {"invite_received", "application_received"} else None
        message = await bot.send_message(
            telegram_user_id,
            notification_text(payload),
            reply_markup=markup,
            parse_mode="HTML",
        )
        storage.add_temporary_message(telegram_user_id, message.chat.id, message.message_id, 300)
        return True
    except Exception:
        return False
