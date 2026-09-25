from html import escape
import re
from urllib.parse import quote

from aiogram import F, Router
from aiogram.filters import CommandStart
from aiogram.filters.command import CommandObject
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

from ..api.client import ApiError, OpiniaApi
from ..config import Settings
from ..services.panel import begin_panel_transition, edit_panel, edit_panel_content
from ..storage.database import BotStorage
from ..ui.formatters import party_text
from ..ui.keyboards import (
    back_keyboard,
    party_invitation_keyboard,
    party_invitation_retry_keyboard,
    party_invitation_copy_keyboard,
    party_slot_occupants,
)
from .registration import start_profile_registration

router = Router(name="party-links")
ROLE_NAMES = {"1": "Керри", "2": "Мид", "3": "Оффлейн", "4": "Саппорт", "5": "Хард-саппорт"}


def parse_party_start_payload(payload: str | None) -> str | None:
    if not payload:
        return None
    match = re.fullmatch(r"party_([A-Za-z0-9_-]{6,16})", payload)
    if not match:
        return None
    return match.group(1)


async def load_party_invitation(api: OpiniaApi, code: str) -> tuple[str, dict]:
    resolved = await api.public("GET", f"/social/parties/join-codes/{quote(code, safe='')}")
    slug = str(resolved.get("slug") or "")
    if not slug:
        raise ApiError("Ссылка на пати недействительна или уже истекла", 404)
    party = await api.public("GET", f"/social/parties/{quote(slug, safe='')}")
    return slug, party


def available_party_roles(party: dict) -> list[str]:
    occupied = party_slot_occupants(party)
    open_roles = [role for role in ("1", "2", "3", "4", "5") if role not in occupied]
    recruited = {str(role) for role in party.get("recruitedRoles") or []}
    return [role for role in open_roles if role in recruited] if recruited else open_roles


def invitation_text(party: dict, available_roles: list[str]) -> str:
    roles = [ROLE_NAMES[role] for role in (party.get("recruitedRoles") or []) if role in available_roles and role in ROLE_NAMES]
    if not roles:
        roles = [ROLE_NAMES[role] for role in available_roles]
    party_name = escape(str(party.get("name") or party.get("title") or "Dota-пати"))
    roles_text = ", ".join(escape(role) for role in roles) if roles else "свободных мест нет"
    return (
        f"<b>Приглашение в пати · {party_name}</b>\n\n"
        f"Ищем: <b>{roles_text}</b>\n"
        "Выберите свободную роль ниже. Для вступления нужен профиль Opinia; если его нет, бот предложит быструю регистрацию.\n\n"
        f"{party_text(party)}"
    )


@router.message(CommandStart(deep_link=True))
async def open_party_link(
    message: Message,
    command: CommandObject,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
    state: FSMContext,
) -> None:
    if message.chat.type != "private" or message.from_user is None:
        return
    code = parse_party_start_payload(command.args)
    if code is None:
        await state.clear()
        await edit_panel(message.bot, storage, api, settings, message.from_user.id, "home", message.chat.id)
        return
    await state.clear()
    await begin_panel_transition(message.bot, storage, message.from_user.id, message.chat.id)
    await show_party_invitation(message.bot, api, settings, storage, message.from_user.id, message.chat.id, code)


@router.callback_query(F.data == "party:share")
async def share_party_link(
    callback: CallbackQuery,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    await callback.answer()
    try:
        parties = await api.user(callback.from_user.id, "GET", "/social/parties/me")
        party = parties.get("party") or ((parties.get("parties") or [None])[-1])
        if not party or not party.get("slug"):
            raise ApiError("Сначала вступите в пати", 404)
        token = await api.user(
            callback.from_user.id,
            "POST",
            f"/social/parties/{quote(str(party['slug']), safe='')}/join-token",
        )
        code = str(token.get("code") or "")
        if parse_party_start_payload(f"party_{code}") is None:
            raise ApiError("Не удалось создать ссылку на пати")
        me = await callback.bot.get_me()
        if not me.username:
            raise ApiError("У бота не настроено имя пользователя для ссылки")
        invite_url = f"t.me/{me.username}?start=party_{code}"
        telegram_app_url = f"tg://resolve?domain={me.username}&start=party_{code}"
        roles = available_party_roles(party)
        roles_text = ", ".join(ROLE_NAMES[role] for role in (party.get("recruitedRoles") or []) if role in roles and role in ROLE_NAMES)
        if not roles_text:
            roles_text = ", ".join(ROLE_NAMES[role] for role in roles) or "мест пока нет"
        share_text = f"🎮 Заходи ко мне в пати Dota 2!\nИщем: {roles_text}.\nВыбери роль в боте:"
        copy_text = f"{share_text}\n\n{invite_url}"
        message = await callback.bot.send_message(
            callback.from_user.id,
            f"{escape(share_text)}\n\n<a href=\"{escape(telegram_app_url)}\">{escape(invite_url)}</a>\n\nЭто сообщение удалится через 10 секунд. Нажмите «Скопировать текст», чтобы отправить приглашение.",
            reply_markup=party_invitation_copy_keyboard(copy_text),
            parse_mode="HTML",
            disable_web_page_preview=True,
        )
        storage.add_temporary_message(callback.from_user.id, message.chat.id, message.message_id, 10)
    except ApiError as error:
        await edit_panel_content(
            callback.bot, storage, api, settings, callback.from_user.id, "party:share-error",
            f"<b>Не удалось создать приглашение</b>\n\n{escape(str(error))}", back_keyboard("party"),
            callback.message.chat.id if callback.message else None,
        )


@router.callback_query(F.data.startswith("partyinvite:link:"))
async def link_account_for_party_invite(
    callback: CallbackQuery,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    code = (callback.data or "").rsplit(":", 1)[-1]
    try:
        await load_party_invitation(api, code)
    except ApiError as error:
        await callback.answer(str(error), show_alert=True)
        return
    storage.set_choices(callback.from_user.id, "pending_party_invite", [{"code": code}])
    await callback.answer()
    await begin_panel_transition(callback.bot, storage, callback.from_user.id, callback.message.chat.id if callback.message else None)
    await edit_panel_content(
        callback.bot, storage, api, settings, callback.from_user.id, "account:link",
        "<b>Сначала привяжите аккаунт Opinia</b>\n\nПосле команды <code>/link 12345678</code> бот вернёт вас к приглашению в пати.",
        InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="Открыть профиль Opinia", url=f"{settings.site_url}/profile")],
            [InlineKeyboardButton(text="← В меню", callback_data="panel:home")],
        ]),
        callback.message.chat.id if callback.message else None,
    )


@router.callback_query(F.data.startswith("partyinvite:join:"))
async def join_party_from_link(
    callback: CallbackQuery,
    state: FSMContext,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    parts = (callback.data or "").split(":")
    if len(parts) != 4 or parts[3] not in ROLE_NAMES:
        await callback.answer("Роль не распознана", show_alert=True)
        return
    code, role = parts[2], parts[3]
    try:
        _, party = await load_party_invitation(api, code)
    except ApiError as error:
        await callback.answer(str(error), show_alert=True)
        return
    if role not in available_party_roles(party):
        await callback.answer("Это место уже заняли. Выберите другую позицию.", show_alert=True)
        if callback.message:
            await show_party_invitation(callback.bot, api, settings, storage, callback.from_user.id, callback.message.chat.id, code)
        return

    session = storage.get_session(callback.from_user.id)
    if not session:
        await start_invite_registration(callback, state, api, settings, storage, code, role)
        return
    try:
        await api.user(callback.from_user.id, "GET", "/dota/profiles/me")
    except ApiError as error:
        if error.status == 404:
            await start_invite_registration(callback, state, api, settings, storage, code, role)
            return
        await callback.answer(str(error), show_alert=True)
        return

    await callback.answer("Вступаю в пати…")
    await begin_panel_transition(callback.bot, storage, callback.from_user.id, callback.message.chat.id if callback.message else None)
    await finish_party_join(callback.bot, api, settings, storage, callback.from_user.id, callback.message.chat.id if callback.message else None, code, role)


async def start_invite_registration(callback, state: FSMContext, api, settings, storage, code: str, role: str) -> None:
    await callback.answer()
    chat_id = callback.message.chat.id if callback.message else None
    await begin_panel_transition(callback.bot, storage, callback.from_user.id, chat_id)
    await start_profile_registration(
        callback.bot,
        state,
        api,
        settings,
        storage,
        callback.from_user.id,
        chat_id,
        invite_code=code,
        invite_role=role,
    )


async def show_party_invitation(bot, api, settings, storage, telegram_user_id: int, chat_id: int, code: str) -> None:
    try:
        _, party = await load_party_invitation(api, code)
        roles = available_party_roles(party)
        text = invitation_text(party, roles)
        if not storage.get_session(telegram_user_id):
            text += "\n\nЕсли у вас уже есть аккаунт Opinia, сначала привяжите его кнопкой ниже, чтобы не создавать второй профиль."
        if not roles:
            text += "\n\nСвободных мест сейчас нет."
        await edit_panel_content(
            bot, storage, api, settings, telegram_user_id, "party:invitation", text,
            party_invitation_keyboard(code, roles, not bool(storage.get_session(telegram_user_id))), chat_id,
        )
    except ApiError as error:
        await edit_panel_content(
            bot, storage, api, settings, telegram_user_id, "party:invitation-error",
            f"<b>Не удалось открыть приглашение</b>\n\n{escape(str(error))}", back_keyboard(), chat_id,
        )


async def finish_party_join(bot, api, settings, storage, telegram_user_id: int, chat_id: int | None, code: str, role: str, recovery_url: str | None = None) -> None:
    try:
        result = await api.user(telegram_user_id, "POST", "/social/parties/join", {"token": code, "positionRole": role})
        if not result.get("isMember"):
            storage.set_choices(telegram_user_id, "pending_party_invite", [])
            text = f"Заявка в пати отправлена. Вы выбрали роль <b>{ROLE_NAMES[role]}</b>; дождитесь подтверждения капитана."
            rows = []
            if recovery_url:
                text += f"\n\nСсылка восстановления профиля:\n<code>{escape(recovery_url)}</code>"
                rows.append([InlineKeyboardButton(text="🔐 Сохранить ссылку восстановления", url=recovery_url)])
            rows.append([InlineKeyboardButton(text="← В меню", callback_data="panel:home")])
            await edit_panel_content(
                bot, storage, api, settings, telegram_user_id, "party:application-pending",
                text, InlineKeyboardMarkup(inline_keyboard=rows), chat_id,
            )
            return
        storage.set_choices(telegram_user_id, "pending_party_invite", [])
        if result.get("slug"):
            from ..services.party_notifications import deliver_join_hint

            await deliver_join_hint(bot, api, storage, telegram_user_id, settings.site_url, result["slug"])
        if recovery_url:
            text = (
                "<b>Профиль готов, вы вступили в пати</b>\n\n"
                f"Выбрана роль: <b>{ROLE_NAMES[role]}</b>\n\n"
                "Сохраните ссылку восстановления профиля:\n<code>"
                f"{escape(recovery_url)}</code>"
            )
            await edit_panel_content(
                bot, storage, api, settings, telegram_user_id, "party:joined-recovery", text,
                InlineKeyboardMarkup(inline_keyboard=[
                    [InlineKeyboardButton(text="🔐 Открыть ссылку восстановления", url=recovery_url)],
                    [InlineKeyboardButton(text="👥 Открыть пати", callback_data="panel:party")],
                ]),
                chat_id,
            )
        else:
            await edit_panel(bot, storage, api, settings, telegram_user_id, "party", chat_id)
    except ApiError as error:
        markup = party_invitation_retry_keyboard(code, role, recovery_url)
        text = f"<b>Профиль готов, но вступить в пати не получилось</b>\n\n{escape(str(error))}\n\nМожно попробовать ещё раз или открыть свободную роль заново."
        await edit_panel_content(bot, storage, api, settings, telegram_user_id, "party:join-error", text, markup, chat_id)


async def resume_pending_party_invitation(bot, api, settings, storage, telegram_user_id: int, chat_id: int | None) -> bool:
    pending = storage.get_choice(telegram_user_id, "pending_party_invite", 0)
    if not pending or not pending.get("code"):
        return False
    storage.set_choices(telegram_user_id, "pending_party_invite", [])
    role = pending.get("role")
    if role in ROLE_NAMES:
        try:
            await api.user(telegram_user_id, "GET", "/dota/profiles/me")
            await finish_party_join(bot, api, settings, storage, telegram_user_id, chat_id, pending["code"], role)
            return True
        except ApiError:
            pass
    await show_party_invitation(bot, api, settings, storage, telegram_user_id, chat_id or telegram_user_id, pending["code"])
    return True
