import asyncio
import logging
import math
import time

from aiogram.exceptions import TelegramAPIError, TelegramForbiddenError
from aiogram.types import CopyTextButton, InlineKeyboardButton, InlineKeyboardMarkup

from .start_links import bot_friend_invite_url
from .temporary_notifications import send_temporary_notification

logger = logging.getLogger(__name__)
SEARCH_TIMEOUT_SECONDS = 30 * 60
NOTICE_TTL_SECONDS = 2 * 60
NOTICE_DELETE_CALLBACK = "search:notice:delete"


def is_current_search(storage, telegram_user_id: int, search: dict) -> bool:
    try:
        started = float(search["startedAt"])
    except (KeyError, ValueError, TypeError, OverflowError):
        return False
    return (
        math.isfinite(started) and started > 0
        and started <= time.time()
        and storage.get_choice(telegram_user_id, "auto_search", 0) == search
    )


def search_reached_timeout(storage, telegram_user_id: int, search: dict) -> bool:
    return is_current_search(storage, telegram_user_id, search) and time.time() - float(search["startedAt"]) >= SEARCH_TIMEOUT_SECONDS


def queue_solo_timeout(storage, telegram_user_id: int, search: dict, profile: dict, memberships: dict) -> None:
    if (
        search.get("mode") != "looking" or not profile.get("lfgTimedOut")
        or profile.get("looking") or memberships.get("party") or memberships.get("parties")
        # The API's deadline is authoritative. The local start may be recorded
        # seconds later after POST completion or delayed party notifications.
        or not is_current_search(storage, telegram_user_id, search)
    ):
        return
    storage.queue_search_timeout_notice(telegram_user_id, f"looking:{search['startedAt']}", "looking")


def queue_recruit_timeout(storage, telegram_user_id: int, search: dict, party: dict) -> None:
    if (
        search.get("mode") != "recruit" or not party.get("isOwner")
        or search.get("partySlug") != party.get("slug")
        or not party.get("recruitmentTimedOut") or party.get("recruitedRoles")
        or int(party.get("memberCount") or len(party.get("members") or [])) >= int(party.get("maxMembers") or 5)
        or not is_current_search(storage, telegram_user_id, search)
    ):
        return
    storage.queue_search_timeout_notice(telegram_user_id, f"recruit:{search.get('partySlug')}:{search['startedAt']}", "recruit")


def queue_solo_stop(storage, telegram_user_id: int, search: dict, profile: dict, memberships: dict) -> None:
    if (
        search.get("mode") != "looking" or profile.get("looking")
        or memberships.get("party") or memberships.get("parties")
        or not is_current_search(storage, telegram_user_id, search)
    ):
        return
    # Use the timeout's event key and lifetime quota so one search cannot
    # consume two notices when a stop races with deadline detection.
    storage.queue_search_timeout_notice(telegram_user_id, f"looking:{search['startedAt']}", "looking")


def queue_recruit_stop(storage, telegram_user_id: int, search: dict, party: dict) -> None:
    if (
        search.get("mode") != "recruit" or not party.get("isOwner")
        or search.get("partySlug") != party.get("slug") or party.get("kind") == "TEAM"
        or party.get("recruitedRoles")
        or int(party.get("memberCount") or len(party.get("members") or [])) >= int(party.get("maxMembers") or 5)
        or not is_current_search(storage, telegram_user_id, search)
    ):
        return
    storage.queue_search_timeout_notice(telegram_user_id, f"recruit:{search.get('partySlug')}:{search['startedAt']}", "recruit")


def timeout_notice_text(ordinal: int, mode: str) -> str:
    result = "В этот раз не удалось собрать полный состав." if mode == "recruit" else "В этот раз пати не нашлась."
    if ordinal == 1:
        return (
            "Привет! Я разработчик FDP 👋\n\n"
            f"{result} Проект ещё развивается, и пока игроков не всегда хватает.\n\n"
            "Когда снова будешь искать пати, запускай поиск и здесь — даже если параллельно ищешь в других местах. "
            "Чем больше нас ищет одновременно, тем легче собраться ❤️\n\n"
            "Я со своей стороны продолжаю улучшать бота. Подпишись на наш канал, чтобы следить за новостями и не потерять FDP.\n\n"
            "Буду благодарен, если позовёшь друзей — это очень поможет проекту!"
        )
    return (
        "Спасибо, что снова попробовал FDP ❤️\n\n"
        f"{result} Пока игроков немного, но каждый новый поиск помогает нам собираться.\n\n"
        "В следующий раз запускай поиск и здесь. Позови друзей — вместе шансов больше!\n\n"
        "А новости и обновления ждут тебя в @FDPcommunity 👇"
    )


def timeout_notice_keyboard(username: str, referral_code: str | None = None) -> InlineKeyboardMarkup:
    invite = bot_friend_invite_url(username, referral_code)
    invitation = f"🎮 Ищем пати в Dota 2? Заходи в FDP — поиск по ролям и MMR, прямо в Telegram:\n{invite}"
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="📣 Канал FDP", url="https://t.me/FDPcommunity")],
        [InlineKeyboardButton(text="📋 Пригласить друзей · скопировать", copy_text=CopyTextButton(text=invitation))],
        [InlineKeyboardButton(text="🗑 Удалить сообщение", callback_data=NOTICE_DELETE_CALLBACK)],
    ])


async def deliver_timeout_notice(bot, storage, row: dict, username: str) -> None:
    user_id = row["telegram_user_id"]
    try:
        await send_temporary_notification(
            bot, storage, user_id, user_id,
            timeout_notice_text(row["ordinal"], row["search_mode"]), NOTICE_TTL_SECONDS,
            reply_markup=timeout_notice_keyboard(username, storage.referral_code(user_id)), disable_web_page_preview=True,
        )
        storage.finish_search_timeout_notice(user_id, row["ordinal"])
    except TelegramForbiddenError:
        storage.finish_search_timeout_notice(user_id, row["ordinal"], blocked=True)
    except TelegramAPIError:
        logger.warning("Could not deliver search timeout notice to user %s; will retry", user_id)


async def search_timeout_notice_worker(bot, storage) -> None:
    username = None
    semaphore = asyncio.Semaphore(5)
    while True:
        try:
            rows = storage.pending_search_timeout_notices()
            if rows:
                if not username:
                    username = (await bot.get_me()).username
                if username:
                    async def send(row):
                        async with semaphore:
                            await deliver_timeout_notice(bot, storage, row, username)
                    results = await asyncio.gather(*(send(row) for row in rows), return_exceptions=True)
                    for result in results:
                        if isinstance(result, Exception):
                            logger.error("Search timeout notice delivery failed (%s)", type(result).__name__)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Search timeout notification delivery failed")
        await asyncio.sleep(5)
