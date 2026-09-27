import asyncio
import hashlib
import json
import logging
import time
from pathlib import Path
from urllib.parse import quote

from aiogram import Bot
from aiogram.exceptions import TelegramAPIError, TelegramBadRequest
from aiogram.types import (
    BufferedInputFile,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    InputMediaPhoto,
)

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
LFG_WINDOW_SECONDS = 20 * 60


def party_card_cache_key(party: dict) -> str:
    card_state = {
        "name": party.get("name"),
        "memberCount": party.get("memberCount"),
        "maxMembers": party.get("maxMembers"),
        "joinMode": party.get("joinMode"),
        "visibility": party.get("visibility"),
        "recruitedRoles": sorted(map(str, party.get("recruitedRoles") or [])),
        "recruitingUntil": party.get("recruitingUntil"),
        "expiresAt": party.get("expiresAt"),
        "members": [
            {
                "displayName": member.get("displayName"),
                "positionRole": member.get("positionRole"),
                "mmr": member.get("mmr"),
                "role": member.get("role"),
            }
            for member in party.get("members") or []
        ],
    }
    serialized = json.dumps(card_state, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def save_party_card_file_id(
    storage: BotStorage,
    telegram_user_id: int,
    cache_key: str | None,
    message,
) -> None:
    if not cache_key or not getattr(message, "photo", None):
        return
    storage.set_choices(
        telegram_user_id,
        "party_card_file",
        [{"cacheKey": cache_key, "fileId": message.photo[-1].file_id}],
    )


def save_default_panel_file_id(storage: BotStorage, telegram_user_id: int, message) -> None:
    if not getattr(message, "photo", None):
        return
    storage.set_choices(
        telegram_user_id,
        "panel_hero_file",
        [{"fileId": message.photo[-1].file_id}],
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
    media_photo: str | BufferedInputFile | None = None,
) -> None:
    if screen == "recruiting":
        screen = "party"
    party_data = None
    if screen == "party":
        try:
            party_data = await api.user(telegram_user_id, "GET", "/social/parties/me")
        except ApiError:
            party_data = {"parties": [], "invites": []}
    text, keyboard = content or await render_screen(
        api,
        storage,
        settings,
        telegram_user_id,
        screen,
        party_data=party_data,
    )
    panel = storage.get_panel(telegram_user_id)
    destination = chat_id or (panel.chat_id if panel else telegram_user_id)
    loading_panel = panel if panel and panel.screen == "loading" else None
    is_default_panel_photo = media_photo is None
    photo: str | BufferedInputFile | None = media_photo
    if photo is None:
        cached_hero = storage.get_choice(telegram_user_id, "panel_hero_file", 0) or {}
        if cached_hero.get("fileId"):
            photo = str(cached_hero["fileId"])
        else:
            try:
                hero_image = await api.fetch_image(f"{settings.site_url}/dota/party-hero-soft.png")
                photo = BufferedInputFile(hero_image, filename="party-hero.png")
            except ApiError as error:
                logger.warning("Could not load bot panel image for user %s: %s", telegram_user_id, error)
    party_card_key = None
    if screen in {"party", "recruiting"}:
        party = (party_data or {}).get("party") or ((party_data or {}).get("parties") or [None])[-1]
        if party and party.get("slug"):
            is_default_panel_photo = False
            party_card_key = party_card_cache_key(party)
            cached_card = storage.get_choice(telegram_user_id, "party_card_file", 0) or {}
            if cached_card.get("cacheKey") == party_card_key and cached_card.get("fileId"):
                photo = str(cached_card["fileId"])
            else:
                try:
                    raw_image = await api.fetch_party_card(
                        settings.site_url,
                        party["slug"],
                        party_card_key or str(time.time_ns()),
                    )
                    photo = BufferedInputFile(raw_image, filename="party-roster.png")
                except ApiError:
                    party_card_key = None
                    is_default_panel_photo = True

    panel_to_replace = panel if panel and panel.chat_id == destination else None
    if loading_panel and loading_panel.chat_id == destination and loading_panel.is_photo and photo is not None:
        try:
            message = await bot.edit_message_media(
                chat_id=loading_panel.chat_id,
                message_id=loading_panel.message_id,
                media=InputMediaPhoto(media=photo, caption=text, parse_mode="HTML"),
                reply_markup=keyboard,
            )
            storage.save_panel(telegram_user_id, loading_panel.chat_id, loading_panel.message_id, screen)
            save_party_card_file_id(storage, telegram_user_id, party_card_key, message)
            if is_default_panel_photo:
                save_default_panel_file_id(storage, telegram_user_id, message)
            return
        except TelegramBadRequest as error:
            if "message is not modified" in str(error).lower():
                storage.save_panel(telegram_user_id, loading_panel.chat_id, loading_panel.message_id, screen)
                return
            if "message to edit not found" not in str(error).lower() and "can't be edited" not in str(error).lower():
                logger.warning("Could not edit photo panel for user %s; sending a text fallback: %s", telegram_user_id, error)
                photo = None
    elif loading_panel and loading_panel.chat_id == destination:
        # Text loading panels cannot be converted into a photo; replace them after sending the new panel.
        pass
    elif panel and panel.chat_id == destination and panel.is_photo and photo is not None:
        panel_to_replace = panel
        try:
            message = await bot.edit_message_media(
                chat_id=panel.chat_id,
                message_id=panel.message_id,
                media=InputMediaPhoto(media=photo, caption=text, parse_mode="HTML"),
                reply_markup=keyboard,
            )
            storage.save_panel(telegram_user_id, panel.chat_id, panel.message_id, screen)
            save_party_card_file_id(storage, telegram_user_id, party_card_key, message)
            if is_default_panel_photo:
                save_default_panel_file_id(storage, telegram_user_id, message)
            return
        except TelegramBadRequest as error:
            if "message is not modified" in str(error).lower():
                return
            if "message to edit not found" not in str(error).lower() and "can't be edited" not in str(error).lower():
                logger.warning("Could not edit photo panel for user %s; sending a text fallback: %s", telegram_user_id, error)
                photo = None
            else:
                try:
                    await bot.delete_message(panel.chat_id, panel.message_id)
                except TelegramAPIError:
                    pass

    elif panel and panel.chat_id == destination and not panel.is_photo:
        if not loading_panel and photo is not None and (isinstance(photo, BufferedInputFile) or screen != "party"):
            # Send the replacement first; the old text panel is removed after delivery succeeds.
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

    is_photo = photo is not None
    if photo is not None:
        try:
            message = await bot.send_photo(destination, photo, caption=text, reply_markup=keyboard, parse_mode="HTML")
        except TelegramBadRequest as error:
            logger.warning("Could not send photo panel for user %s; sending a text fallback: %s", telegram_user_id, error)
            message = await bot.send_message(
                destination,
                text,
                reply_markup=keyboard,
                parse_mode="HTML",
                disable_web_page_preview=True,
            )
            is_photo = False
    else:
        message = await bot.send_message(
            destination,
            text,
            reply_markup=keyboard,
            parse_mode="HTML",
            disable_web_page_preview=True,
        )
    storage.save_panel(telegram_user_id, message.chat.id, message.message_id, screen, is_photo)
    save_party_card_file_id(storage, telegram_user_id, party_card_key, message)
    if is_default_panel_photo:
        save_default_panel_file_id(storage, telegram_user_id, message)
    if panel_to_replace and panel_to_replace.message_id != message.message_id:
        try:
            await bot.delete_message(panel_to_replace.chat_id, panel_to_replace.message_id)
        except TelegramAPIError:
            pass


async def begin_panel_transition(
    bot: Bot,
    storage: BotStorage,
    telegram_user_id: int,
    chat_id: int | None = None,
) -> None:
    """Show immediate feedback in the current panel while its replacement loads."""
    panel = storage.get_panel(telegram_user_id)
    if panel and panel.screen == "loading":
        return
    destination = chat_id or (panel.chat_id if panel else telegram_user_id)
    if panel and panel.chat_id == destination:
        try:
            if panel.is_photo:
                await bot.edit_message_caption(
                    chat_id=panel.chat_id,
                    message_id=panel.message_id,
                    caption="⏳ Обновляю окно…",
                    reply_markup=None,
                )
            else:
                await bot.edit_message_text(
                    "⏳ Обновляю окно…",
                    chat_id=panel.chat_id,
                    message_id=panel.message_id,
                    reply_markup=None,
                    disable_web_page_preview=True,
                )
            storage.save_panel(telegram_user_id, panel.chat_id, panel.message_id, "loading", panel.is_photo)
            return
        except TelegramBadRequest as error:
            if "message is not modified" in str(error).lower():
                storage.save_panel(telegram_user_id, panel.chat_id, panel.message_id, "loading", panel.is_photo)
                return
            if "message to edit not found" not in str(error).lower() and "can't be edited" not in str(error).lower():
                raise
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
    media_photo: str | BufferedInputFile | None = None,
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
        media_photo=media_photo,
    )


def dota_id_guide_photo() -> BufferedInputFile:
    guide_path = Path(__file__).resolve().parents[1] / "assets" / "dota-id-location.png"
    return BufferedInputFile(guide_path.read_bytes(), filename="dota-id-location.png")


async def refresh_active_search_panels(
    bot: Bot,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    """Refresh countdowns for active searches without re-uploading party images."""
    while True:
        try:
            for telegram_user_id in storage.session_user_ids():
                search = storage.get_choice(telegram_user_id, "auto_search", 0) or {}
                panel = storage.get_panel(telegram_user_id)
                if not panel:
                    continue
                try:
                    if search.get("mode") == "looking" and panel.screen == "looking":
                        profile = await api.user(telegram_user_id, "GET", "/dota/profiles/me")
                        if not profile.get("looking"):
                            storage.set_choices(telegram_user_id, "auto_search", [])
                        text, keyboard = await render_screen(
                            api,
                            storage,
                            settings,
                            telegram_user_id,
                            "looking",
                        )
                    elif panel.screen == "party" and (
                        search.get("mode") == "recruit"
                        or storage.get_choice(telegram_user_id, "party_search_watch", 0)
                    ):
                        parties = await api.user(telegram_user_id, "GET", "/social/parties/me")
                        party = parties.get("party") or ((parties.get("parties") or [None])[-1])
                        if not party:
                            storage.set_choices(telegram_user_id, "auto_search", [])
                            storage.set_choices(telegram_user_id, "party_search_watch", [])
                            await edit_panel(bot, storage, api, settings, telegram_user_id, "home")
                            continue
                        if search.get("mode") == "recruit" and party.get("slug") != search.get("partySlug"):
                            storage.set_choices(telegram_user_id, "auto_search", [])
                        if not party.get("recruitedRoles"):
                            storage.set_choices(telegram_user_id, "auto_search", [])
                        text, keyboard = await render_screen(
                            api,
                            storage,
                            settings,
                            telegram_user_id,
                            "party",
                            party_data=parties,
                        )
                    else:
                        continue
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


async def recover_loading_panels(
    bot: Bot,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    """Replace panels left in the transient loading state by a previous bot process."""
    for telegram_user_id in storage.session_user_ids():
        panel = storage.get_panel(telegram_user_id)
        if not panel or panel.screen != "loading":
            continue
        try:
            await edit_panel(bot, storage, api, settings, telegram_user_id, "home", panel.chat_id)
        except (ApiError, TelegramAPIError) as error:
            logger.warning("Could not recover loading panel for user %s: %s", telegram_user_id, error)


async def render_screen(
    api: OpiniaApi,
    storage: BotStorage,
    settings: Settings,
    telegram_user_id: int,
    screen: str,
    *,
    party_data: dict | None = None,
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
            "Найдите команду для игры или соберите свою пати. Выберите, с чего начать:",
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

    if screen == "party":
        profile = None
        my_parties = party_data if party_data is not None else await fetch_parties()
    else:
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
        search = storage.get_choice(telegram_user_id, "auto_search", 0) or {}
        elapsed = search_elapsed_seconds(profile.get("lfgExpiresAt"), search.get("startedAt"))
        remaining = remaining_seconds(profile.get("lfgExpiresAt"))
        timer = f"\n\n⏱ Поиск идёт: <b>{format_duration(elapsed)}</b>"
        if remaining is not None:
            timer += f" · осталось {format_duration(remaining)}"
        return (
            f"<b>Ищу пати · {escape_text(profile.get('title') or 'Игрок')}</b>\n"
            f"MMR: {escape_text(profile.get('mmr') or '—')}\n"
            f"Позиции: {escape_text(roles_text)}\n\n"
            "Подбираю пати автоматически по позициям и MMR."
            f"{timer}",
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
        storage.set_choices(
            telegram_user_id,
            "party_search_watch",
            [{"partySlug": party.get("slug")}] if searching_roles else [],
        )
        role_names = {"1": "Керри", "2": "Мид", "3": "Оффлейн", "4": "Саппорт", "5": "Хард-саппорт"}
        if searching_roles:
            roles_text = ", ".join(role_names[role] for role in sorted(searching_roles))
            until = party.get("recruitingUntil")
            remaining = remaining_seconds(until)
            search = storage.get_choice(telegram_user_id, "auto_search", 0) or {}
            elapsed = search_elapsed_seconds(until, search.get("startedAt"))
            timer = f"\n⏱ Набор идёт: <b>{format_duration(elapsed)}</b>"
            if remaining is not None:
                timer += f" · осталось {format_duration(remaining)}"
            text += f"\n\n🔎 <b>Ищем игроков:</b> {escape_text(roles_text)}{timer}"
        else:
            text += "\n\nПодбор сейчас не запущен. Нажмите FREE под свободной ролью, чтобы искать игрока на неё."
        profile = None
        if searching_roles:
            try:
                profile = await api.user(telegram_user_id, "GET", "/dota/profiles/me")
            except ApiError:
                pass
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


def search_elapsed_seconds(expires_at: object, started_at: object = None) -> int:
    try:
        if started_at is not None:
            return max(0, min(LFG_WINDOW_SECONDS, int(time.time() - float(started_at))))
    except (TypeError, ValueError, OverflowError):
        pass
    remaining = remaining_seconds(expires_at)
    return LFG_WINDOW_SECONDS - remaining if remaining is not None else 0
