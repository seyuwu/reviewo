import asyncio
from html import escape

from aiogram import F, Router
from aiogram.exceptions import TelegramAPIError
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message

from ..api.client import ApiError, OpiniaApi
from ..config import Settings
from ..services.callbacks import acknowledge_callback
from ..services.broadcast_duration import (
    BROADCAST_TTL_PRESETS,
    format_broadcast_duration,
    parse_broadcast_duration,
    validate_broadcast_duration,
)
from ..services.panel import edit_panel_content
from ..services.temporary_notifications import send_temporary_notification
from ..storage.database import BotStorage
from ..ui.keyboards import (
    admin_compose_keyboard,
    admin_keyboard,
    admin_preview_keyboard,
    admin_broadcast_duration_keyboard,
)

router = Router(name="admin")
_broadcast_send_locks: dict[int, asyncio.Lock] = {}


class BroadcastDraft(StatesGroup):
    composing = State()
    choosing_duration = State()
    custom_duration = State()
    preview = State()


def is_admin(settings: Settings, telegram_user_id: int) -> bool:
    return telegram_user_id in settings.admin_ids


def _last_broadcast_text(summary: dict | None) -> str:
    if not summary:
        return "Рассылок пока не было."
    status_names = {"queued": "в очереди", "sending": "отправляется", "completed": "завершена"}
    return (
        f"Последняя рассылка #{summary['id']}: "
        f"{status_names.get(summary['status'], summary['status'])} · "
        f"доставлено {summary['sent']}/{summary['total']} · очередь {summary['pending']} · "
        f"пропущено {summary['skipped']} · блокировки {summary['blocked']} · ошибки {summary['failed']}"
    )


def _acquisition_text(stats: dict) -> str:
    average = stats.get("avg_search_seconds_30d")
    accounts = int(stats.get("accounts_created_30d", 0) or 0)
    account_searchers = int(stats.get("account_search_users_30d", 0) or 0)
    conversion = round(account_searchers * 100 / accounts) if accounts else 0
    if average is None:
        average_text = "пока нет данных"
    else:
        minutes, seconds = divmod(average, 60)
        average_text = f"{minutes} мин {seconds} сек"
    return "\n".join(
        (
            f"Создали аккаунт за 30 дней: {accounts}",
            f"Начали поиск после аккаунта: {account_searchers}/{accounts} ({conversion}%)",
            f"Просто начали поиск за 30 дней: {stats.get('search_users_30d', 0)} игроков",
            f"Создали пати за 30 дней: {stats.get('party_created_users_30d', 0)} игроков",
            f"Вступили в пати за 30 дней: {stats.get('party_joined_users_30d', 0)} игроков",
            f"Среднее время поиска за 30 дней: {average_text}",
        )
    )


def _search_metrics_text(metrics: dict | None) -> str:
    if metrics is None:
        return (
            "Ищут сейчас (бот + сайт): временно недоступно\n"
            "Поиск → пати за 30 дней: временно недоступно"
        )

    searching = int(metrics.get("searchingPlayers", 0) or 0)
    completed = int(metrics.get("completedSearches30d", 0) or 0)
    joined = int(metrics.get("searchesJoinedParty30d", 0) or 0)
    if completed:
        conversion_text = (
            f"{joined} из {completed} завершённых "
            f"({round(joined * 100 / completed)}%)"
        )
    else:
        conversion_text = "пока нет завершённых поисков"

    return (
        f"Ищут сейчас (бот + сайт): {searching} игроков\n"
        f"Поиск → пати за 30 дней: {conversion_text}"
    )


async def show_admin_panel(
    bot,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
    telegram_user_id: int,
    chat_id: int | None = None,
    notice: str | None = None,
) -> None:
    stats = storage.bot_user_stats()
    acquisition = storage.bot_acquisition_stats()
    try:
        live_search_metrics = await api.search_metrics()
    except ApiError:
        live_search_metrics = None
    text = (
        "<b>Администрирование FDP</b>\n\n"
        f"Запустили бота: <b>{stats['total']}</b>\n"
        f"Пользователей с сессией: <b>{stats['registered']}</b>\n"
        f"Получают объявления: <b>{stats['subscribers']}</b>\n\n"
        f"{escape(_search_metrics_text(live_search_metrics))}\n\n"
        f"<b>Воронка и активность за 30 дней</b>\n"
        f"{escape(_acquisition_text(acquisition))}"
        f"\n\n{escape(_last_broadcast_text(storage.broadcast_summary()))}"
    )
    if notice:
        text = f"{escape(notice)}\n\n{text}"
    await edit_panel_content(
        bot,
        storage,
        api,
        settings,
        telegram_user_id,
        "admin",
        text,
        admin_keyboard(),
        chat_id,
    )


def _preview_text(text: str, storage: BotStorage, ttl_seconds: int) -> str:
    excerpt = escape(text[:120])
    if len(text) > 120:
        excerpt += "…"
    recipients = storage.bot_user_stats()["subscribers"]
    return (
        f"<b>Предпросмотр рассылки</b>\n\n"
        f"Получателей: <b>{recipients}</b> · символов: <b>{len(text)}</b>\n\n"
        f"Удаление: через <b>{format_broadcast_duration(ttl_seconds)}</b> после доставки каждому получателю.\n\n"
        f"{excerpt}\n\n"
        "Можно отправить полный тест себе, затем подтвердить рассылку."
    )


async def _get_draft_text(settings: Settings, state: FSMContext, telegram_user_id: int) -> str | None:
    if not is_admin(settings, telegram_user_id):
        return None
    data = await state.get_data()
    value = data.get("broadcast_text")
    return str(value) if isinstance(value, str) and value.strip() else None


async def _get_draft_duration(state: FSMContext) -> int | None:
    try:
        return validate_broadcast_duration((await state.get_data()).get("broadcast_ttl_seconds"))
    except ValueError:
        return None


async def show_duration_picker(bot, api, settings, storage, state, user_id, chat_id) -> None:
    await state.set_state(BroadcastDraft.choosing_duration)
    await edit_panel_content(
        bot, storage, api, settings, user_id, "admin:broadcast:duration",
        "<b>Когда удалить сообщение?</b>\n\nВыбери срок после доставки каждому получателю. "
        "Можно указать своё время, максимум 47 часов.",
        admin_broadcast_duration_keyboard(), chat_id,
    )


async def show_broadcast_preview(bot, api, settings, storage, state, user_id, chat_id) -> None:
    text = await _get_draft_text(settings, state, user_id)
    ttl_seconds = await _get_draft_duration(state)
    if text is None or ttl_seconds is None:
        return
    await state.set_state(BroadcastDraft.preview)
    await edit_panel_content(
        bot, storage, api, settings, user_id, "admin:broadcast:preview",
        _preview_text(text, storage, ttl_seconds), admin_preview_keyboard(), chat_id,
    )


@router.message(Command("admin"))
async def open_admin(
    message: Message,
    state: FSMContext,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    if message.chat.type != "private" or message.from_user is None:
        return
    if not is_admin(settings, message.from_user.id):
        await send_temporary_notification(
            message.bot,
            storage,
            message.from_user.id,
            message.chat.id,
            "Нет доступа к панели администратора.",
            5,
        )
        return
    await state.clear()
    storage.record_bot_user(message.from_user.id)
    await show_admin_panel(message.bot, api, settings, storage, message.from_user.id, message.chat.id)


@router.callback_query(F.data.startswith("admin:"))
async def admin_action(
    callback: CallbackQuery,
    state: FSMContext,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    if not is_admin(settings, callback.from_user.id):
        await callback.answer("Нет доступа", show_alert=True)
        return
    if callback.message is None or callback.message.chat.type != "private":
        acknowledge_callback(callback)
        return

    acknowledge_callback(callback)
    action = (callback.data or "").removeprefix("admin:")
    chat_id = callback.message.chat.id
    if action == "refresh":
        await show_admin_panel(callback.bot, api, settings, storage, callback.from_user.id, chat_id)
        return
    if action == "cancel":
        await state.clear()
        await show_admin_panel(callback.bot, api, settings, storage, callback.from_user.id, chat_id)
        return
    if action == "broadcast:new":
        await state.clear()
        await state.set_state(BroadcastDraft.composing)
        await edit_panel_content(
            callback.bot,
            storage,
            api,
            settings,
            callback.from_user.id,
            "admin:broadcast:compose",
            "<b>Новая рассылка</b>\n\nНапиши текст объявления. Затем выбери срок удаления. "
            "Сообщение получат пользователи, которые запускали бота и не заблокировали его.",
            admin_compose_keyboard(),
            chat_id,
        )
        return
    if action == "broadcast:edit":
        data = await state.get_data()
        await state.set_state(BroadcastDraft.composing)
        await edit_panel_content(
            callback.bot,
            storage,
            api,
            settings,
            callback.from_user.id,
            "admin:broadcast:compose",
            "<b>Изменить рассылку</b>\n\nОтправь новый текст объявления.",
            admin_compose_keyboard(),
            chat_id,
        )
        await state.update_data(
            broadcast_text=data.get("broadcast_text"),
            broadcast_ttl_seconds=data.get("broadcast_ttl_seconds"),
        )
        return
    if action == "broadcast:duration":
        if await _get_draft_text(settings, state, callback.from_user.id) is not None:
            await show_duration_picker(callback.bot, api, settings, storage, state, callback.from_user.id, chat_id)
        return
    if action.startswith("broadcast:ttl:"):
        if await _get_draft_text(settings, state, callback.from_user.id) is None:
            return
        value = action.removeprefix("broadcast:ttl:")
        if value == "custom":
            await state.set_state(BroadcastDraft.custom_duration)
            await edit_panel_content(
                callback.bot, storage, api, settings, callback.from_user.id,
                "admin:broadcast:duration",
                "<b>Свой срок удаления</b>\n\nНапиши время: например, 30 сек, 10 мин, 2 ч или 1 день. "
                "Число без единицы — минуты. От 1 секунды до 47 часов.",
                admin_compose_keyboard(), chat_id,
            )
        elif value.isdecimal() and int(value) in BROADCAST_TTL_PRESETS:
            await state.update_data(broadcast_ttl_seconds=int(value))
            await show_broadcast_preview(callback.bot, api, settings, storage, state, callback.from_user.id, chat_id)
        return
    if action == "broadcast:test":
        text = await _get_draft_text(settings, state, callback.from_user.id)
        ttl_seconds = await _get_draft_duration(state)
        if text is None or ttl_seconds is None:
            return
        test_message = await callback.bot.send_message(callback.from_user.id, text, disable_web_page_preview=True)
        storage.add_temporary_message(callback.from_user.id, test_message.chat.id, test_message.message_id, ttl_seconds)
        return
    if action == "broadcast:send":
        lock = _broadcast_send_locks.setdefault(callback.from_user.id, asyncio.Lock())
        async with lock:
            text = await _get_draft_text(settings, state, callback.from_user.id)
            ttl_seconds = await _get_draft_duration(state)
            if text is None or ttl_seconds is None or await state.get_state() != BroadcastDraft.preview.state:
                return
            campaign_id, recipient_count = storage.create_broadcast(callback.from_user.id, text, ttl_seconds)
            await state.clear()
        await show_admin_panel(
            callback.bot,
            api,
            settings,
            storage,
            callback.from_user.id,
            chat_id,
            f"Рассылка #{campaign_id} поставлена в очередь для {recipient_count} пользователей. "
            f"Удаление через {format_broadcast_duration(ttl_seconds)} после доставки.",
        )


@router.callback_query(F.data.in_({"news:enable", "news:disable"}))
async def dismiss_legacy_news_button(
    callback: CallbackQuery,
) -> None:
    # Old messages can still contain the retired preference buttons.
    acknowledge_callback(callback, "Эта кнопка больше не используется")
    if callback.message is not None and callback.message.chat.type == "private":
        try:
            await callback.message.edit_reply_markup(reply_markup=None)
        except TelegramAPIError:
            pass


@router.message(BroadcastDraft.composing, F.text & ~F.text.startswith("/"))
async def receive_broadcast_text(
    message: Message,
    state: FSMContext,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    if message.chat.type != "private" or message.from_user is None or not is_admin(settings, message.from_user.id):
        await state.clear()
        return
    text = (message.text or "").strip()
    if not text:
        return
    if len(text) > 4096:
        await edit_panel_content(
            message.bot,
            storage,
            api,
            settings,
            message.from_user.id,
            "admin:broadcast:compose",
            "Текст длиннее лимита Telegram. Сократи его до 4096 символов и отправь ещё раз.",
            admin_compose_keyboard(),
            message.chat.id,
        )
        return
    await state.update_data(broadcast_text=text)
    if await _get_draft_duration(state) is None:
        await show_duration_picker(message.bot, api, settings, storage, state, message.from_user.id, message.chat.id)
    else:
        await show_broadcast_preview(message.bot, api, settings, storage, state, message.from_user.id, message.chat.id)


@router.message(BroadcastDraft.custom_duration, F.text & ~F.text.startswith("/"))
async def receive_broadcast_duration(
    message: Message,
    state: FSMContext,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    if message.chat.type != "private" or message.from_user is None or not is_admin(settings, message.from_user.id):
        await state.clear()
        return
    try:
        ttl_seconds = parse_broadcast_duration(message.text or "")
    except ValueError as error:
        await edit_panel_content(
            message.bot, storage, api, settings, message.from_user.id,
            "admin:broadcast:duration", escape(str(error)), admin_compose_keyboard(), message.chat.id,
        )
        return
    await state.update_data(broadcast_ttl_seconds=ttl_seconds)
    await show_broadcast_preview(message.bot, api, settings, storage, state, message.from_user.id, message.chat.id)
