from html import escape
import logging

from aiogram import F, Router
from aiogram.filters import Command, CommandStart
from aiogram.filters.command import CommandObject
from aiogram.fsm.context import FSMContext
from aiogram.types import BusinessConnection, CallbackQuery, Message, User

from .config import Settings
from .rate_limit import HourlyRateLimiter
from .replies import (
    TemplateStore,
    after_contact_saved_message,
    build_contact_type_keyboard,
    contact_prompt,
)
from .states import ContactStates
from .storage import IncomingUser, WelcomeFlowStorage
from .welcome_flow import (
    confirmed_for,
    is_business_owner,
    mark_human_handled,
    process_incoming_dm,
    remember_business_owner,
    resolve_start_source,
)


logger = logging.getLogger(__name__)
router = Router(name="welcome_flow")


@router.business_connection()
async def handle_business_connection(connection: BusinessConnection) -> None:
    remember_business_owner(connection.user.id)

    status = "enabled" if connection.is_enabled else "disabled"
    can_reply = None
    if connection.rights is not None:
        can_reply = connection.rights.can_reply
    elif connection.can_reply is not None:
        can_reply = connection.can_reply

    logger.info(
        "Business connection %s owner=%s user_chat_id=%s can_reply=%s",
        status,
        connection.user.id,
        connection.user_chat_id,
        can_reply,
    )
    if connection.is_enabled and can_reply is False:
        logger.warning(
            "Business connection for user_chat_id=%s has can_reply=False. "
            "Enable «Ответы на сообщения» / Reply to messages in Telegram Business bot settings.",
            connection.user_chat_id,
        )


@router.business_message()
async def handle_business_message(
    message: Message,
    settings: Settings,
    storage: WelcomeFlowStorage,
    templates: TemplateStore,
    rate_limiter: HourlyRateLimiter,
    state: FSMContext,
) -> None:
    if message.from_user is None or message.chat is None:
        return

    # Private business DM: customer → from_user.id == chat.id.
    # Your reply → from_user.id != chat.id → cancel pending auto-welcome.
    if message.from_user.id != message.chat.id:
        peer_id = message.chat.id
        mark_human_handled(peer_id)
        # Peer may never have written first — upsert before FK event insert.
        storage.upsert_user(
            IncomingUser(
                telegram_user_id=peer_id,
                username=message.chat.username,
                first_name=message.chat.first_name,
            ),
            source="human_skip",
        )
        storage.add_event("human_skip", peer_id, {"reason": "owner_replied"})
        logger.info("Owner replied in chat %s — auto-welcome suppressed", peer_id)
        return

    if is_business_owner(message.from_user.id):
        return

    current = await state.get_state()
    if current == ContactStates.waiting_value.state:
        await handle_contact_value(message, state, storage)
        return

    await process_incoming_dm(
        message,
        settings,
        storage,
        templates,
        rate_limiter,
        source="business",
    )


@router.message(CommandStart())
async def handle_start(
    message: Message,
    command: CommandObject,
    settings: Settings,
    storage: WelcomeFlowStorage,
    templates: TemplateStore,
    rate_limiter: HourlyRateLimiter,
    state: FSMContext,
) -> None:
    await state.clear()
    source = resolve_start_source(command.args)

    await process_incoming_dm(
        message,
        settings,
        storage,
        templates,
        rate_limiter,
        source=source,
    )


@router.message(Command("stats"))
async def handle_stats(message: Message, settings: Settings, storage: WelcomeFlowStorage) -> None:
    user = require_user(message)
    if user.id not in settings.admin_ids:
        await message.answer("Команда доступна только администратору.")
        return

    stats = storage.get_stats()
    conversion_pct = stats.contact_conversion * 100
    lines = [
        "<b>Welcome Flow stats</b>",
        f"Users total: <b>{stats.users_total}</b>",
        f"Users today: <b>{stats.users_today}</b>",
        f"DM received: <b>{stats.dm_received}</b>",
        f"DM replied: <b>{stats.dm_replied}</b>",
        f"Contact added: <b>{stats.contact_added}</b>",
        f"Contact conversion: <b>{conversion_pct:.1f}%</b>",
        f"Cooldown skips: <b>{stats.cooldown_skip}</b>",
        f"Rate limit skips: <b>{stats.rate_limit_skip}</b>",
        f"Last reply: <b>{escape(stats.last_reply_at or '—')}</b>",
        "",
        "<b>Last 10</b>",
    ]

    if not stats.last_10:
        lines.append("Пока пусто.")
    else:
        for _telegram_user_id, username, template_id, last_reply_at in stats.last_10:
            label = f"@{username}" if username else str(_telegram_user_id)
            lines.append(
                f"• {escape(label)} · {escape(template_id or '—')} · {escape(last_reply_at or '—')}"
            )

    await answer(message, "\n".join(lines), parse_mode="HTML")


@router.message(Command("cancel"))
async def handle_cancel(message: Message, state: FSMContext) -> None:
    await state.clear()
    await answer(message, "Ок, отменил.")


@router.callback_query(F.data == "cta:contact")
async def handle_cta_contact(callback: CallbackQuery, state: FSMContext) -> None:
    user = callback.from_user
    await state.clear()
    await callback.answer()

    if callback.message is not None:
        await answer(
            callback.message,
            "Как удобнее оставить контакт?",
            reply_markup=build_contact_type_keyboard(user.username),
        )


@router.callback_query(F.data == "contact:use_username")
async def handle_use_username(
    callback: CallbackQuery,
    storage: WelcomeFlowStorage,
    state: FSMContext,
) -> None:
    user = callback.from_user
    if not user.username:
        await callback.answer("У тебя нет username в Telegram.", show_alert=True)
        return

    ensure_user_exists(storage, user)
    storage.add_contact(
        telegram_user_id=user.id,
        preferred_contact="telegram_username",
        value=f"@{user.username}",
        confirmed=True,
    )
    await state.clear()
    await callback.answer("Сохранено")

    if callback.message is not None:
        await answer(callback.message, after_contact_saved_message(confirmed=True))


@router.callback_query(F.data.startswith("contact:type:"))
async def handle_contact_type(callback: CallbackQuery, state: FSMContext) -> None:
    preferred = callback.data.removeprefix("contact:type:") if callback.data else ""
    if preferred not in {"telegram_username", "discord", "email", "other"}:
        await callback.answer("Неизвестный тип", show_alert=True)
        return

    await state.set_state(ContactStates.waiting_value)
    await state.update_data(preferred_contact=preferred)
    await callback.answer()

    if callback.message is not None:
        await answer(callback.message, contact_prompt(preferred))


@router.callback_query(F.data == "contact:cancel")
async def handle_contact_cancel(callback: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    await callback.answer("Отменено")
    if callback.message is not None:
        await answer(callback.message, "Ок, без контакта. Канал всё ещё в сообщении выше.")


@router.message(ContactStates.waiting_value)
async def handle_contact_value(
    message: Message,
    state: FSMContext,
    storage: WelcomeFlowStorage,
) -> None:
    user = require_user(message)
    data = await state.get_data()
    preferred = str(data.get("preferred_contact", ""))
    value = (message.text or "").strip()

    if preferred not in {"telegram_username", "discord", "email", "other"}:
        await state.clear()
        await answer(message, "Сессия сброшена. Нажми «Другой контакт» ещё раз.")
        return

    if not value or len(value) > 200:
        await answer(message, "Пришли контакт одной короткой строкой (до 200 символов).")
        return

    if preferred == "telegram_username" and not value.startswith("@"):
        value = f"@{value.lstrip('@')}"

    ensure_user_exists(storage, user)
    confirmed = confirmed_for(preferred)
    storage.add_contact(
        telegram_user_id=user.id,
        preferred_contact=preferred,
        value=value,
        confirmed=confirmed,
    )
    await state.clear()
    await answer(message, after_contact_saved_message(confirmed))


async def answer(message: Message, text: str, **kwargs) -> None:
    # aiogram 3.30+ already injects business_connection_id from business messages.
    await message.answer(text, **kwargs)


def require_user(message: Message) -> User:
    if message.from_user is None:
        raise RuntimeError("Telegram message has no sender.")
    return message.from_user


def ensure_user_exists(storage: WelcomeFlowStorage, user: User) -> None:
    storage.upsert_user(
        IncomingUser(
            telegram_user_id=user.id,
            username=user.username,
            first_name=user.first_name,
        ),
        source="contact",
    )
