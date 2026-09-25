from aiogram import Bot
from aiogram.exceptions import TelegramAPIError, TelegramBadRequest
from aiogram.types import BufferedInputFile, InlineKeyboardButton, InlineKeyboardMarkup, InputMediaPhoto
import asyncio
import logging
import time
from urllib.parse import quote

from ..api.client import ApiError, OpiniaApi
from ..config import Settings
from ..storage.database import BotStorage
from ..ui.formatters import party_text, profile_text
from ..ui.keyboards import (
    account_keyboard,
    back_keyboard,
    home_keyboard,
    looking_keyboard,
    kick_confirmation_keyboard,
    party_keyboard,
    party_member_keyboard,
    party_slot_occupants,
    profile_keyboard,
)

logger = logging.getLogger(__name__)


async def edit_panel(
    bot: Bot,
    storage: BotStorage,
    api: OpiniaApi,
    settings: Settings,
    telegram_user_id: int,
    screen: str = "home",
    chat_id: int | None = None,
    *,
    content: tuple[str, InlineKeyboardMarkup] | None = None,
) -> None:
    if screen == "recruiting":
        screen = "party"
    text, keyboard = content or await render_screen(api, storage, settings, telegram_user_id, screen)
    panel = storage.get_panel(telegram_user_id)
    destination = chat_id or (panel.chat_id if panel else telegram_user_id)
    loading_panel = panel if panel and panel.screen == "loading" else None
    photo: str | BufferedInputFile = f"{settings.site_url}/dota/party-hero-soft.png"
    if screen in {"party", "recruiting"}:
        try:
            my_parties = await api.user(telegram_user_id, "GET", "/social/parties/me")
            party = my_parties.get("party") or ((my_parties.get("parties") or [None])[-1])
            if party and party.get("slug"):
                raw_image = await api.fetch_party_card(
                    settings.site_url,
                    party["slug"],
                    str(party.get("updatedAt") or time.time_ns()),
                )
                photo = BufferedInputFile(raw_image, filename="party-roster.png")
        except ApiError:
            pass

    if loading_panel and loading_panel.chat_id == destination:
        # Keep the instant loading message visible until the final panel is sent.
        pass
    elif panel and panel.chat_id == destination and panel.is_photo:
        try:
            await bot.edit_message_media(
                chat_id=panel.chat_id,
                message_id=panel.message_id,
                media=InputMediaPhoto(media=photo, caption=text, parse_mode="HTML"),
                reply_markup=keyboard,
            )
            storage.save_panel(telegram_user_id, panel.chat_id, panel.message_id, screen)
            return
        except TelegramBadRequest as error:
            if "message is not modified" in str(error).lower():
                return
            if "message to edit not found" not in str(error).lower() and "can't be edited" not in str(error).lower():
                raise
            try:
                await bot.delete_message(panel.chat_id, panel.message_id)
            except TelegramBadRequest:
                pass

    elif panel and panel.chat_id == destination and not panel.is_photo:
        if not loading_panel and (isinstance(photo, BufferedInputFile) or screen != "party"):
            try:
                await bot.delete_message(panel.chat_id, panel.message_id)
            except TelegramBadRequest:
                pass
        else:
            try:
                await bot.edit_message_text(
                    text,
                    chat_id=panel.chat_id,
                    message_id=panel.message_id,
                    reply_markup=keyboard,
                    parse_mode="HTML",
                    disable_web_page_preview=True,
                )
                storage.save_panel(telegram_user_id, panel.chat_id, panel.message_id, screen, False)
                return
            except TelegramBadRequest:
                pass

    try:
        message = await bot.send_photo(destination, photo, caption=text, reply_markup=keyboard, parse_mode="HTML")
        storage.save_panel(telegram_user_id, message.chat.id, message.message_id, screen)
    except TelegramBadRequest:
        message = await bot.send_message(
            destination,
            text,
            reply_markup=keyboard,
            parse_mode="HTML",
            disable_web_page_preview=True,
        )
        storage.save_panel(telegram_user_id, message.chat.id, message.message_id, screen, False)
    if loading_panel and loading_panel.message_id != message.message_id:
        try:
            await bot.delete_message(loading_panel.chat_id, loading_panel.message_id)
        except TelegramAPIError:
            pass


async def begin_panel_transition(
    bot: Bot,
    storage: BotStorage,
    telegram_user_id: int,
    chat_id: int | None = None,
) -> None:
    """Show immediate feedback, then remove the stale panel while data loads."""
    panel = storage.get_panel(telegram_user_id)
    if panel and panel.screen == "loading":
        return
    destination = chat_id or (panel.chat_id if panel else telegram_user_id)
    try:
        message = await bot.send_message(destination, "⏳ Обновляю окно…")
    except TelegramAPIError:
        return
    storage.save_panel(telegram_user_id, message.chat.id, message.message_id, "loading", False)
    if panel and panel.chat_id == message.chat.id:
        try:
            await bot.delete_message(panel.chat_id, panel.message_id)
        except TelegramAPIError:
            pass


async def edit_panel_content(
    bot: Bot,
    storage: BotStorage,
    api: OpiniaApi,
    settings: Settings,
    telegram_user_id: int,
    screen: str,
    text: str,
    keyboard: InlineKeyboardMarkup,
    chat_id: int | None = None,
) -> None:
    await edit_panel(
        bot,
        storage,
        api,
        settings,
        telegram_user_id,
        screen,
        chat_id,
        content=(text, keyboard),
    )


async def refresh_active_search_panels(
    bot: Bot,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    """Refresh countdowns for active party search without re-uploading party images."""
    while True:
        try:
            for telegram_user_id in storage.session_user_ids():
                search = storage.get_choice(telegram_user_id, "auto_search", 0) or {}
                panel = storage.get_panel(telegram_user_id)
                if search.get("mode") != "recruit" or not panel or panel.screen != "party":
                    continue
                try:
                    parties = await api.user(telegram_user_id, "GET", "/social/parties/me")
                    party = parties.get("party") or ((parties.get("parties") or [None])[-1])
                    if not party or party.get("slug") != search.get("partySlug"):
                        storage.set_choices(telegram_user_id, "auto_search", [])
                        continue
                    if not party.get("recruitedRoles"):
                        storage.set_choices(telegram_user_id, "auto_search", [])
                    text, keyboard = await render_screen(api, storage, settings, telegram_user_id, "party")
                    if panel.is_photo:
                        await bot.edit_message_caption(
                            chat_id=panel.chat_id,
                            message_id=panel.message_id,
                            caption=text,
                            reply_markup=keyboard,
                            parse_mode="HTML",
                        )
                    else:
                        await bot.edit_message_text(
                            text,
                            chat_id=panel.chat_id,
                            message_id=panel.message_id,
                            reply_markup=keyboard,
                            parse_mode="HTML",
                            disable_web_page_preview=True,
                        )
                except TelegramBadRequest as error:
                    if "message is not modified" not in str(error).lower():
                        logger.info("Could not refresh party search panel for %s: %s", telegram_user_id, error)
                except ApiError:
                    continue
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Party search panel refresh failed")
        await asyncio.sleep(15)


async def render_screen(
    api: OpiniaApi,
    storage: BotStorage,
    settings: Settings,
    telegram_user_id: int,
    screen: str,
) -> tuple[str, InlineKeyboardMarkup]:
    session = storage.get_session(telegram_user_id)
    if not session:
        if screen == "account":
            return (
                "<b>Аккаунт</b>\n\nСоздайте Dota-профиль или войдите в существующий аккаунт Opinia.",
                account_keyboard(False, False, False),
            )
        return (
            "<b>Поиск пати Dota 2 · Opinia</b>\n\n"
            "Найдите команду для игры или соберите состав сами.\n\n"
            "Для начала откройте раздел «Аккаунт»: там можно создать Dota-профиль или войти в существующий аккаунт Opinia.",
            home_keyboard(False, False),
        )

    async def fetch_profile() -> dict | None:
        try:
            return await api.user(telegram_user_id, "GET", "/dota/profiles/me")
        except ApiError:
            return None

    async def fetch_parties() -> dict:
        try:
            return await api.user(telegram_user_id, "GET", "/social/parties/me")
        except ApiError:
            return {"parties": [], "invites": []}

    profile, my_parties = await asyncio.gather(fetch_profile(), fetch_parties())

    if screen == "home":
        if not profile:
            return (
                "<b>Аккаунт привязан</b>\n\nОткройте «Аккаунт» и создайте Dota-профиль, чтобы начать поиск.",
                home_keyboard(False, False),
            )
        name = escape_text(profile.get("title", "Игрок"))
        mmr = escape_text(profile.get("mmr") or "—")
        party = my_parties.get("party") or (my_parties.get("parties") or [None])[-1]
        looking = profile.get("looking", False)
        state = "поиск активен" if looking else "не ищет"
        text = (
            f"<b>Поиск пати Dota 2 · Opinia</b>\n\n"
            f"Игрок: <b>{name}</b> · {mmr} MMR\n"
            f"Статус: {state}"
        )
        if party:
            text += f"\nПати: <b>{escape_text(party.get('name', ''))}</b> · {party.get('memberCount', 0)}/{party.get('maxMembers', 5)}"
        invites = [item for item in my_parties.get("invites", []) if item.get("status") == "PENDING"]
        if invites:
            text += f"\nОжидают ответа: {len(invites)}"
        text += (
            "\n\nВыберите режим поиска ниже.\n"
            "Профиль, привязка и заявки — в «Аккаунте»."
        )
        auto_search = storage.get_choice(telegram_user_id, "auto_search", 0) or {}
        is_recruiting = bool(looking and auto_search.get("mode") == "recruit")
        is_looking = bool(looking and auto_search.get("mode") == "looking")
        return text, home_keyboard(True, bool(party), is_recruiting, is_looking)

    if screen == "looking":
        if not profile:
            return "Сначала создайте Dota-профиль в разделе «Аккаунт».", back_keyboard()
        roles = profile.get("roles") or []
        role_names = {"1": "Керри", "2": "Мид", "3": "Оффлейн", "4": "Саппорт", "5": "Хард-саппорт"}
        roles_text = ", ".join(role_names[role] for role in roles if role in role_names) or "не выбраны"
        if not profile.get("looking"):
            return (
                "Автопоиск завершён. Нажмите ниже, чтобы искать пати снова.",
                InlineKeyboardMarkup(
                    inline_keyboard=[
                        [InlineKeyboardButton(text="🔎 Искать пати", callback_data="search:looking")],
                        [InlineKeyboardButton(text="← В меню", callback_data="panel:home")],
                    ]
                ),
            )
        return (
            f"<b>Ищу пати · {escape_text(profile.get('title') or 'Игрок')}</b>\n"
            f"MMR: {escape_text(profile.get('mmr') or '—')}\n"
            f"Позиции: {escape_text(roles_text)}\n\n"
            "Подбираю пати автоматически по позициям и MMR.",
            looking_keyboard(),
        )

    if screen == "profile":
        if not profile:
            return "Dota-профиль не найден. Создайте его из меню.", back_keyboard()
        return profile_text(profile), profile_keyboard()

    if screen == "account":
        if not profile:
            text = "<b>Аккаунт</b>\n\nСоздайте Dota-профиль или привяжите аккаунт Opinia."
        else:
            text = (
                "<b>Аккаунт</b>\n\n"
                f"Игрок: <b>{escape_text(profile.get('title') or 'Игрок')}</b> · "
                f"{escape_text(profile.get('mmr') or '—')} MMR\n"
                f"Opinia: {'привязан к Telegram' if session else 'не привязан'}"
            )
        invites = [item for item in my_parties.get("invites", []) if item.get("status") == "PENDING"]
        return (
            text,
            account_keyboard(
                bool(session),
                bool(session.recovery_url) if session else False,
                bool(profile),
                bool(my_parties.get("party") or my_parties.get("parties")),
                bool(invites),
            ),
        )

    if screen == "party":
        parties = my_parties.get("parties") or []
        party = my_parties.get("party") or (parties[-1] if parties else None)
        if not party:
            return "Вы пока не состоите в пати.", home_keyboard(True, False)
        text = party_text(party)
        occupants = party_slot_occupants(party)
        available_roles = {role for role in ("1", "2", "3", "4", "5") if role not in occupants}
        searching_roles = set(map(str, party.get("recruitedRoles") or [])) & available_roles
        role_names = {"1": "Керри", "2": "Мид", "3": "Оффлейн", "4": "Саппорт", "5": "Хард-саппорт"}
        if searching_roles:
            roles_text = ", ".join(role_names[role] for role in sorted(searching_roles))
            until = party.get("recruitingUntil")
            remaining = remaining_seconds(until)
            timer = f" · осталось {format_duration(remaining)}" if remaining is not None else ""
            text += f"\n\n🔎 <b>Ищем игроков:</b> {escape_text(roles_text)}{timer}"
        else:
            text += "\n\nПодбор сейчас не запущен. Нажмите FREE под свободной ролью, чтобы искать игрока на неё."
        web_access_url = None
        if settings.site_url and party.get("slug"):
            try:
                cached_ticket = storage.get_choice(telegram_user_id, "web_access_ticket", 0) or {}
                if (
                    cached_ticket.get("partySlug") == party.get("slug")
                    and float(cached_ticket.get("expiresAt") or 0) > time.time()
                ):
                    ticket = str(cached_ticket["ticket"])
                else:
                    ticket = await api.create_web_access_ticket(telegram_user_id)
                    storage.set_choices(
                        telegram_user_id,
                        "web_access_ticket",
                        [
                            {
                                "ticket": ticket,
                                "partySlug": party.get("slug"),
                                "expiresAt": time.time() + 9 * 60,
                            }
                        ],
                    )
                next_path = f"/dota/teams/{party['slug']}"
                web_access_url = (
                    f"{settings.site_url.rstrip('/')}/telegram/access"
                    f"?ticket={quote(ticket, safe='')}&next={quote(next_path, safe='')}"
                )
            except ApiError:
                logger.warning(
                    "Could not create website login link for Telegram user %s",
                    telegram_user_id,
                    exc_info=True,
                )
        return text, party_keyboard(
            party,
            bool(party.get("canManageParty")),
            searching_roles,
            settings.site_url,
            web_access_url,
        )

    if screen in {"member", "kick_confirm"}:
        selected_member = storage.get_choice(telegram_user_id, "selected_party_member", 0) or {}
        selected_user_id = selected_member.get("userId")
        party = my_parties.get("party") or ((my_parties.get("parties") or [None])[-1])
        member = next(
            (item for item in (party or {}).get("members", []) if item.get("userId") == selected_user_id),
            None,
        )
        if not party or not member:
            return "Игрок больше не состоит в этой пати.", back_keyboard("party")

        current_profile = None
        if member.get("dotaSlug"):
            try:
                current_profile = await api.user(
                    telegram_user_id, "GET", f"/dota/profiles/{quote(str(member['dotaSlug']), safe='')}"
                )
            except ApiError:
                pass
        name = escape_text((current_profile or {}).get("title") or member.get("displayName") or "Игрок")
        mmr = escape_text((current_profile or {}).get("mmr") or member.get("mmr") or "—")
        role = escape_text(member.get("positionRole") or "не выбрана")
        back_target = "party"
        can_kick = bool(party.get("canManageParty")) and member.get("role") != "OWNER"
        if member.get("role") == "OFFICER" and not party.get("isOwner"):
            can_kick = False

        if screen == "kick_confirm":
            if not can_kick:
                return "У вас нет прав удалить этого игрока.", back_keyboard(back_target)
            return (
                f"<b>Удалить игрока из пати?</b>\n\n{name} · {mmr} MMR\nПосле удаления слот освободится.",
                kick_confirmation_keyboard(str(member["userId"])),
            )
        if current_profile:
            text = profile_text(current_profile)
        else:
            text = f"<b>Профиль игрока</b>\n\nИгрок: <b>{name}</b>\nMMR: <b>{mmr}</b>"
        text += f"\nРоль в пати: <b>{role}</b>"
        return text, party_member_keyboard(member, can_kick, settings.site_url, back_target)

    if screen == "invites":
        incoming = [item for item in my_parties.get("invites", []) if item.get("status") == "PENDING"]
        outgoing_applications = [
            item for item in my_parties.get("outgoingInvites", [])
            if item.get("status") == "PENDING"
            and item.get("inviteKind") == "APPLICATION"
            and item.get("inviteeUserId") != (profile or {}).get("ownerUserId")
        ]
        my_applications = [
            item for item in my_parties.get("outgoingInvites", [])
            if item.get("status") == "PENDING"
            and item.get("inviteKind") == "APPLICATION"
            and item.get("inviteeUserId") == (profile or {}).get("ownerUserId")
        ]
        actionable = incoming + outgoing_applications
        if not actionable and not my_applications:
            return "Новых заявок и приглашений нет.", back_keyboard()
        buttons = []
        lines = ["<b>Заявки и приглашения</b>", ""]
        for application in my_applications[:10]:
            lines.append(
                f"• Ваша заявка в пати {escape_text(application.get('partyName') or '')} ожидает ответа"
            )
        for invite in actionable[:10]:
            label = "Заявка" if invite.get("inviteKind") == "APPLICATION" else "Приглашение"
            actor = invite.get("inviteeDisplayName") or invite.get("partyName") or "Игрок"
            lines.append(f"• {label}: {escape_text(actor)} · {escape_text(invite.get('partyName') or '')}")
            buttons.append([
                InlineKeyboardButton(text="✅ Принять", callback_data=f"invite:{invite['id']}:accept"),
                InlineKeyboardButton(text="✖️ Отклонить", callback_data=f"invite:{invite['id']}:decline"),
            ])
        buttons.append([InlineKeyboardButton(text="← В меню", callback_data="panel:home")])
        return "\n".join(lines), InlineKeyboardMarkup(inline_keyboard=buttons)

    if screen == "recruit":
        return (
            "Автоподбор включён: ищем игроков на все свободные позиции.",
            back_keyboard("home"),
        )

    return "Поиск пати Dota 2 · Opinia", home_keyboard(True, False)


def escape_text(value: object) -> str:
    from html import escape

    return escape(str(value))


def remaining_seconds(value: object) -> int | None:
    from datetime import datetime, timezone

    try:
        expires_at = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        return max(0, int((expires_at - datetime.now(timezone.utc)).total_seconds()))
    except (TypeError, ValueError):
        return None


def format_duration(seconds: int) -> str:
    minutes, remainder = divmod(seconds, 60)
    return f"{minutes:02}:{remainder:02}"
