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
from ..services.panel import edit_panel_content
from ..services.temporary_notifications import send_temporary_notification
from ..storage.database import BotStorage
from ..ui.keyboards import (
    admin_compose_keyboard,
    admin_keyboard,
    admin_preview_keyboard,
    announcements_keyboard,
)

router = Router(name="admin")


class BroadcastDraft(StatesGroup):
    composing = State()
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
        f"отписки {summary['skipped']} · блокировки {summary['blocked']} · ошибки {summary['failed']}"
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


async def show_news_panel(
    bot,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
    telegram_user_id: int,
    chat_id: int | None = None,
    notice: str | None = None,
) -> None:
    enabled = storage.announcements_enabled(telegram_user_id)
    status = "включены" if enabled else "отключены"
    text = f"<b>Новости FDP</b>\n\nОбъявления об обновлениях сейчас <b>{status}</b>."
    if notice:
        text = f"{escape(notice)}\n\n{text}"
    await edit_panel_content(
        bot,
        storage,
        api,
        settings,
        telegram_user_id,
        "news",
        text,
        announcements_keyboard(enabled),
        chat_id,
    )


def _preview_text(text: str, storage: BotStorage) -> str:
    excerpt = escape(text[:120])
    if len(text) > 120:
        excerpt += "…"
    recipients = storage.bot_user_stats()["subscribers"]
    return (
        f"<b>Предпросмотр рассылки</b>\n\n"
        f"Получателей: <b>{recipients}</b> · символов: <b>{len(text)}</b>\n\n"
        f"{excerpt}\n\n"
        "Можно отправить полный тест себе, затем подтвердить рассылку."
    )


async def _get_draft_text(settings: Settings, state: FSMContext, telegram_user_id: int) -> str | None:
    if not is_admin(settings, telegram_user_id):
        return None
    data = await state.get_data()
    value = data.get("broadcast_text")
    return str(value) if isinstance(value, str) and value.strip() else None


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


@router.message(Command("news"))
async def open_news_settings(
    message: Message,
    state: FSMContext,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    if message.chat.type != "private" or message.from_user is None:
        return
    await state.clear()
    storage.record_bot_user(message.from_user.id)
    await show_news_panel(message.bot, api, settings, storage, message.from_user.id, message.chat.id)


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
            "<b>Новая рассылка</b>\n\nНапиши текст объявления. Он будет отправлен пользователям, которые запускали бота и не отключили новости.",
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
        await state.update_data(broadcast_text=data.get("broadcast_text"))
        return
    if action == "broadcast:test":
        text = await _get_draft_text(settings, state, callback.from_user.id)
        if text is None:
            return
        test_message = await callback.bot.send_message(callback.from_user.id, text, disable_web_page_preview=True)
        storage.add_temporary_message(callback.from_user.id, test_message.chat.id, test_message.message_id, 600)
        return
    if action == "broadcast:send":
        text = await _get_draft_text(settings, state, callback.from_user.id)
        if text is None:
            await show_admin_panel(callback.bot, api, settings, storage, callback.from_user.id, chat_id)
            return
        campaign_id, recipient_count = storage.create_broadcast(callback.from_user.id, text)
        await state.clear()
        await show_admin_panel(
            callback.bot,
            api,
            settings,
            storage,
            callback.from_user.id,
            chat_id,
            f"Рассылка #{campaign_id} поставлена в очередь для {recipient_count} пользователей.",
        )


@router.callback_query(F.data.in_({"news:enable", "news:disable"}))
async def set_news_preference(
    callback: CallbackQuery,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    enabled = callback.data == "news:enable"
    storage.set_announcements_enabled(callback.from_user.id, enabled)
    acknowledge_callback(callback, "Объявления включены" if enabled else "Объявления отключены")
    if callback.message is None:
        return
    if callback.message.chat.type != "private":
        return
    panel = storage.get_panel(callback.from_user.id)
    is_panel_message = bool(
        panel
        and panel.chat_id == callback.message.chat.id
        and panel.message_id == callback.message.message_id
    )
    if is_panel_message:
        await show_news_panel(
            callback.bot,
            api,
            settings,
            storage,
            callback.from_user.id,
            callback.message.chat.id,
            "Настройка сохранена.",
        )
    else:
        # The broadcast itself is the notification; dismiss it after its only action is used.
        try:
            await callback.message.delete()
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
    await state.set_state(BroadcastDraft.preview)
    await edit_panel_content(
        message.bot,
        storage,
        api,
        settings,
        message.from_user.id,
        "admin:broadcast:preview",
        _preview_text(text, storage),
        admin_preview_keyboard(),
        message.chat.id,
    )
