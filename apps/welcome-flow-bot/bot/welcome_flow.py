import asyncio
import logging
import random
import re

from aiogram.exceptions import TelegramBadRequest
from aiogram.types import Message

from .config import Settings
from .rate_limit import HourlyRateLimiter
from .replies import TemplateStore, build_welcome
from .storage import IncomingUser, WelcomeFlowStorage


logger = logging.getLogger(__name__)

# Prevent duplicate welcomes when user sends a burst during delay.
_inflight_users: set[int] = set()
_inflight_lock = asyncio.Lock()

# Business account owners (from business_connection updates).
_business_owner_ids: set[int] = set()
# Peers where owner already replied manually — skip / cancel auto-welcome.
_human_handled_users: set[int] = set()


def remember_business_owner(owner_user_id: int) -> None:
    _business_owner_ids.add(owner_user_id)


def is_business_owner(user_id: int) -> bool:
    return user_id in _business_owner_ids


def mark_human_handled(peer_user_id: int) -> None:
    """Owner replied in this chat — do not auto-welcome this peer."""
    _human_handled_users.add(peer_user_id)


def is_human_handled(user_id: int) -> bool:
    return user_id in _human_handled_users


async def process_incoming_dm(
    message: Message,
    settings: Settings,
    storage: WelcomeFlowStorage,
    templates: TemplateStore,
    rate_limiter: HourlyRateLimiter,
    *,
    source: str,
) -> None:
    telegram_user = message.from_user
    if telegram_user is None:
        return

    user_id = telegram_user.id

    incoming = IncomingUser(
        telegram_user_id=user_id,
        username=telegram_user.username,
        first_name=telegram_user.first_name,
    )
    storage.upsert_user(incoming, source)
    storage.add_event("dm_received", user_id, {"source": source})

    if is_human_handled(user_id):
        storage.add_event("human_skip", user_id)
        logger.info("Human skip for user %s (owner already chatting)", user_id)
        return

    if not storage.can_send_welcome(user_id, settings.cooldown_days):
        storage.add_event("cooldown_skip", user_id)
        logger.info("Cooldown skip for user %s", user_id)
        return

    async with _inflight_lock:
        if user_id in _inflight_users:
            storage.add_event("inflight_skip", user_id)
            logger.info("Inflight skip for user %s (burst during welcome delay)", user_id)
            return
        _inflight_users.add(user_id)

    try:
        if not rate_limiter.allow():
            storage.add_event("rate_limit_skip", user_id)
            logger.warning("Rate limit skip for user %s", user_id)
            return

        delay = random.uniform(settings.delay_min_seconds, settings.delay_max_seconds)
        await asyncio.sleep(delay)

        # Owner may have answered during delay — abort auto-welcome.
        if is_human_handled(user_id):
            storage.add_event("human_skip", user_id)
            logger.info("Human skip after delay for user %s", user_id)
            return

        # Re-check cooldown after delay in case of parallel updates.
        if not storage.can_send_welcome(user_id, settings.cooldown_days):
            storage.add_event("cooldown_skip", user_id)
            return

        template_id = storage.next_template_id(templates.ids)
        welcome = build_welcome(templates, template_id, settings.channel_url)

        try:
            # aiogram 3.30+ already injects business_connection_id from the message.
            await message.answer(
                welcome.text,
                reply_markup=welcome.reply_markup,
            )
        except TelegramBadRequest as error:
            error_text = str(error)
            storage.add_event(
                "reply_failed",
                user_id,
                {
                    "error": error_text[:200],
                    "chat_id": message.chat.id if message.chat else None,
                    "business_connection_id": message.business_connection_id,
                },
            )
            if "BUSINESS_PEER_INVALID" in error_text:
                logger.warning(
                    "BUSINESS_PEER_INVALID for user=%s chat=%s. "
                    "Chat outside bot recipients (e.g. only New chats but history exists), "
                    "or reply permission off in Telegram Business settings.",
                    user_id,
                    message.chat.id if message.chat else None,
                )
                return
            raise

        storage.record_welcome(user_id, template_id)
        storage.add_event(
            "dm_replied",
            user_id,
            {"template_id": template_id, "source": source},
        )
        logger.info("Welcome sent to %s template=%s", user_id, template_id)
    finally:
        async with _inflight_lock:
            _inflight_users.discard(user_id)


def resolve_start_source(payload: str | None) -> str:
    if not payload:
        return "organic"

    normalized = payload.strip().lower()
    normalized = re.sub(r"[^a-z0-9_-]", "", normalized)
    return normalized[:64] or "organic"


def confirmed_for(preferred_contact: str) -> bool:
    return preferred_contact != "email"
