from html import escape
from urllib.parse import quote

from aiogram import F, Router
from aiogram.filters import CommandStart
from aiogram.filters.command import CommandObject
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

from ..api.client import ApiError, OpiniaApi
from ..config import Settings
from ..services.callbacks import acknowledge_callback
from ..services.panel import (
    begin_panel_transition,
    edit_panel,
    edit_panel_content,
)
from ..services.start_links import (
    bot_friend_invite_url,
    parse_acquisition_tag,
    parse_party_start_payload,
    parse_referral_start_payload,
)
from ..services.temporary_notifications import send_temporary_notification
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
    acquisition_tag = parse_acquisition_tag(command.args)
    has_existing_panel = storage.get_panel(message.from_user.id) is not None
    storage.record_bot_user(
        message.from_user.id,
        acquisition_tag[0] if acquisition_tag else ("party_invite" if code else "direct"),
        acquisition_tag[1] if acquisition_tag else None,
        referral_code=parse_referral_start_payload(command.args),
        display_name=message.from_user.full_name,
        username=message.from_user.username,
    )
    if code is None:
        await state.clear()
        storage.set_choices(message.from_user.id, "pending_onboarding_action", [])
        await edit_panel(
            message.bot,
            storage,
            api,
            settings,
            message.from_user.id,
            "home",
            message.chat.id,
            force_new_message=has_existing_panel,
        )
        return
    await state.clear()
    storage.set_choices(message.from_user.id, "pending_onboarding_action", [])
    await begin_panel_transition(message.bot, storage, message.from_user.id, message.chat.id)
    await show_party_invitation(message.bot, api, settings, storage, message.from_user.id, message.chat.id, code)


@router.callback_query(F.data == "party:share")
async def share_party_link(
    callback: CallbackQuery,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    acknowledge_callback(callback)
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
        referral = storage.referral_code(callback.from_user.id, callback.from_user.full_name,
                                         callback.from_user.username)
        payload = f"party_{code}_ref_{referral}"
        invite_url = f"https://t.me/{me.username}?start={payload}"
        telegram_app_url = f"tg://resolve?domain={me.username}&start={payload}"
        roles = available_party_roles(party)
        roles_text = ", ".join(ROLE_NAMES[role] for role in (party.get("recruitedRoles") or []) if role in roles and role in ROLE_NAMES)
        if not roles_text:
            roles_text = ", ".join(ROLE_NAMES[role] for role in roles) or "мест пока нет"
        share_text = f"🎮 Заходи ко мне в пати Dota 2!\nИщем: {roles_text}.\nВыбери роль в боте:"
        copy_text = f"{share_text}\n\n{invite_url}"
        await send_temporary_notification(
            callback.bot,
            storage,
            callback.from_user.id,
            callback.from_user.id,
            f"{escape(share_text)}\n\n<a href=\"{escape(telegram_app_url)}\">{escape(invite_url)}</a>\n\nЭто сообщение удалится через 10 секунд. Нажмите «Скопировать текст», чтобы отправить приглашение.",
            10,
            reply_markup=party_invitation_copy_keyboard(copy_text),
            parse_mode="HTML",
            disable_web_page_preview=True,
        )
    except ApiError as error:
        await edit_panel_content(
            callback.bot, storage, api, settings, callback.from_user.id, "party:share-error",
            f"<b>Не удалось создать приглашение</b>\n\n{escape(str(error))}", back_keyboard("party"),
            callback.message.chat.id if callback.message else None,
        )


@router.callback_query(F.data == "invite:friends")
async def share_bot_link(callback: CallbackQuery, storage: BotStorage) -> None:
    acknowledge_callback(callback)
    me = await callback.bot.get_me()
    if not me.username:
        return
    code = storage.referral_code(callback.from_user.id, callback.from_user.full_name,
                                 callback.from_user.username)
    link = bot_friend_invite_url(me.username, code)
    copy_text = f"Удобный бот для поиска пати, заходи пробуй: {link}"
    await send_temporary_notification(
        callback.bot, storage, callback.from_user.id, callback.from_user.id,
        f"Твоя личная ссылка для приглашения друзей:\n{link}\n\n"
        "Нажми «Скопировать текст» и отправь его друзьям. Новые запуски по ссылке будут учтены за тобой.",
        20, reply_markup=party_invitation_copy_keyboard(copy_text), disable_web_page_preview=True,
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
    acknowledge_callback(callback)
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

    acknowledge_callback(callback, "Вступаю в пати…")
    await begin_panel_transition(callback.bot, storage, callback.from_user.id, callback.message.chat.id if callback.message else None)
    await finish_party_join(callback.bot, api, settings, storage, callback.from_user.id, callback.message.chat.id if callback.message else None, code, role)


async def start_invite_registration(callback, state: FSMContext, api, settings, storage, code: str, role: str) -> None:
    acknowledge_callback(callback)
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


async def finish_party_join(bot, api, settings, storage, telegram_user_id: int, chat_id: int | None, code: str, role: str) -> None:
    try:
        result = await api.user(telegram_user_id, "POST", "/social/parties/join", {"token": code, "positionRole": role})
        if not result.get("isMember"):
            storage.set_choices(telegram_user_id, "pending_party_invite", [])
            text = f"Заявка в пати отправлена. Вы выбрали роль <b>{ROLE_NAMES[role]}</b>; дождитесь подтверждения капитана."
            await edit_panel_content(
                bot, storage, api, settings, telegram_user_id, "party:application-pending",
                text, InlineKeyboardMarkup(inline_keyboard=[[
                    InlineKeyboardButton(text="← В меню", callback_data="panel:home")
                ]]), chat_id,
            )
            return
        storage.set_choices(telegram_user_id, "pending_party_invite", [])
        # Joining from an invitation is not a search result, even if the user
        # happened to have a search timer running before opening the invite.
        storage.record_party_joined(telegram_user_id, clear_search_timer=True)
        if result.get("slug"):
            from ..services.party_notifications import deliver_join_hint

            await deliver_join_hint(bot, api, storage, telegram_user_id, settings.site_url, result["slug"])
        await edit_panel(bot, storage, api, settings, telegram_user_id, "party", chat_id)
    except ApiError as error:
        markup = party_invitation_retry_keyboard(code, role)
        text = f"<b>Не получилось вступить в пати</b>\n\n{escape(str(error))}\n\nМожно попробовать ещё раз или открыть свободную роль заново."
        await edit_panel_content(bot, storage, api, settings, telegram_user_id, "party:join-error", text, markup, chat_id)


async def resume_pending_party_invitation(bot, state: FSMContext, api, settings, storage, telegram_user_id: int, chat_id: int | None) -> bool:
    pending = storage.get_choice(telegram_user_id, "pending_party_invite", 0)
    if not pending or not pending.get("code"):
        return False
    storage.set_choices(telegram_user_id, "pending_party_invite", [])
    role = pending.get("role")
    if role in ROLE_NAMES:
        try:
            await api.user(telegram_user_id, "GET", "/dota/profiles/me")
        except ApiError as error:
            if error.status == 404:
                await start_profile_registration(
                    bot,
                    state,
                    api,
                    settings,
                    storage,
                    telegram_user_id,
                    chat_id,
                    invite_code=pending["code"],
                    invite_role=role,
                )
                return True
            await show_party_invitation(
                bot, api, settings, storage, telegram_user_id, chat_id or telegram_user_id, pending["code"]
            )
            return True
        await finish_party_join(bot, api, settings, storage, telegram_user_id, chat_id, pending["code"], role)
        return True
    await show_party_invitation(bot, api, settings, storage, telegram_user_id, chat_id or telegram_user_id, pending["code"])
    return True
