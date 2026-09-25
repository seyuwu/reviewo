from aiogram import Bot
from aiogram.exceptions import TelegramAPIError, TelegramBadRequest
from aiogram.types import BufferedInputFile, InlineKeyboardButton, InlineKeyboardMarkup, InputMediaPhoto
import asyncio
import time

from ..api.client import ApiError, OpiniaApi
from ..config import Settings
from ..storage.database import BotStorage
from ..ui.formatters import party_text, profile_text
from ..ui.keyboards import (
    account_keyboard,
    back_keyboard,
    candidate_action_keyboard,
    candidate_keyboard,
    home_keyboard,
    role_keyboard,
    recruiting_party_keyboard,
)


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
    text, keyboard = content or await render_screen(api, storage, settings, telegram_user_id, screen)
    panel = storage.get_panel(telegram_user_id)
    destination = chat_id or (panel.chat_id if panel else telegram_user_id)
    loading_panel = panel if panel and panel.screen == "loading" else None
    photo: str | BufferedInputFile = f"{settings.site_url}/dota/party-hero-soft.png"
    if screen == "party":
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
                "<b>Аккаунт</b>\n\nСоздайте Dota-профиль или привяжите аккаунт Opinia.",
                account_keyboard(False, False, False),
            )
        return (
            "<b>Поиск пати Dota 2 · Opinia</b>\n\nСоздайте профиль или привяжите аккаунт сайта.",
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
                "<b>Аккаунт привязан</b>\n\nСоздайте Dota-профиль, чтобы начать поиск.",
                home_keyboard(False, False),
            )
        name = escape_text(profile.get("title", "Игрок"))
        mmr = escape_text(profile.get("mmr") or "—")
        party = my_parties.get("party") or (my_parties.get("parties") or [None])[-1]
        looking = profile.get("looking", False)
        state = "поиск активен" if looking else "не ищет"
        text = f"<b>Поиск пати Dota 2 · Opinia</b>\n\nИгрок: <b>{name}</b> · {mmr} MMR\nСтатус: {state}"
        if party:
            text += f"\nПати: <b>{escape_text(party.get('name', ''))}</b> · {party.get('memberCount', 0)}/{party.get('maxMembers', 5)}"
        invites = [item for item in my_parties.get("invites", []) if item.get("status") == "PENDING"]
        if invites:
            text += f"\nОжидают ответа: {len(invites)}"
        auto_search = storage.get_choice(telegram_user_id, "auto_search", 0) or {}
        is_recruiting = bool(looking and auto_search.get("mode") == "recruit")
        return text, home_keyboard(True, bool(party), is_recruiting)

    if screen == "profile":
        if not profile:
            return "Dota-профиль не найден. Создайте его из меню.", back_keyboard()
        return profile_text(profile), back_keyboard()

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
        link = f"{settings.site_url}/dota/teams/{party.get('slug', '')}"
        text = party_text(party) + f"\n\n<a href=\"{escape_text(link)}\">Чат и Discord на сайте</a>"
        return text, back_keyboard()

    if screen == "recruiting":
        party = my_parties.get("party") or ((my_parties.get("parties") or [None])[-1])
        if not party:
            return "Пати не найдена. Вернитесь в меню и начните набор заново.", back_keyboard()
        search = storage.get_choice(telegram_user_id, "auto_search", 0) or {}
        roles = search.get("roles") or []
        role_names = {"1": "Керри", "2": "Мид", "3": "Оффлейн", "4": "Саппорт", "5": "Хард-саппорт"}
        roles_text = ", ".join(role_names[role] for role in roles if role in role_names) or "все свободные позиции"
        text = (
            f"<b>Набираю игроков · {escape_text((profile or {}).get('title') or 'Игрок')}</b>\n"
            f"Ищем: {escape_text(roles_text)}\n"
            f"Состав: {party.get('memberCount', 0)}/{party.get('maxMembers', 5)}\n\n"
            "Нажмите на свободную позицию, чтобы выбрать игрока."
        )
        return text, recruiting_party_keyboard(party, str((profile or {}).get("ownerUserId") or ""))

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

    if screen == "candidates":
        choices = storage.get_choice(telegram_user_id, "candidates", 0)
        candidates = []
        # All candidates are stored as one list at index zero.
        if choices and isinstance(choices.get("items"), list):
            candidates = choices["items"]
        mode = (choices or {}).get("mode", "looking")
        if not candidates:
            target = "recruiting" if mode == "recruit" else "home"
            return (
                "Пока нет подходящих игроков. Попробуйте обновить список через минуту.",
                InlineKeyboardMarkup(
                    inline_keyboard=[
                        [InlineKeyboardButton(text="🔄 Обновить", callback_data="search:list")],
                        [InlineKeyboardButton(text="← Назад", callback_data=f"panel:{target}")],
                    ]
                ),
            )
        lines = ["<b>Подходящие игроки</b>", ""]
        for candidate in candidates[:8]:
            lines.append(
                f"• {escape_text(str(candidate.get('title', 'Игрок'))[:40])} · {escape_text(candidate.get('mmr') or '—')} MMR"
            )
        if len(candidates) > 8:
            lines.append(f"\nВ списке ещё {len(candidates) - 8} игроков.")
        return "\n".join(lines), candidate_keyboard(candidates, mode)

    if screen == "candidate":
        choice = storage.get_choice(telegram_user_id, "selected_candidate", 0)
        if not choice:
            return "Игрок больше недоступен. Обновите список.", back_keyboard("candidates")
        name = escape_text(choice.get("title") or "Игрок")
        roles = ", ".join(escape_text(role) for role in choice.get("roles", [])) or "—"
        text = f"<b>{name}</b>\nMMR: {escape_text(choice.get('mmr') or '—')}\nПозиции: {roles}"
        mode = storage.get_choice(telegram_user_id, "candidates", 0) or {}
        return text, candidate_action_keyboard(choice, mode.get("mode", "looking"))

    if screen == "recruit":
        selected = storage.get_choice(telegram_user_id, "recruit_roles", 0) or {}
        return (
            "<b>Какие позиции ищем?</b>\nВыберите одну или несколько. Нажмите на номер позиции:\n"
            "1 — керри · 2 — мид · 3 — оффлейн · 4 — саппорт · 5 — хард-саппорт.",
            role_keyboard(selected.get("roles", [])),
        )

    return "Поиск пати Dota 2 · Opinia", home_keyboard(True, False)


def escape_text(value: object) -> str:
    from html import escape

    return escape(str(value))
