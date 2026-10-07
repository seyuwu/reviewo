import asyncio
from html import escape

from aiogram import F, Router
from aiogram.exceptions import TelegramAPIError
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message, MessageEntity
from aiogram.utils.text_decorations import html_decoration

from ..api.client import ApiError, OpiniaApi
from ..config import Settings
from ..services.callbacks import acknowledge_callback
from ..services.broadcast_content import broadcast_preview_pages, normalize_broadcast_entities, validate_broadcast_content
from ..services.broadcasts import send_broadcast_message
from ..services.registration_notices import send_registration_message
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
    admin_registration_notice_keyboard,
)

router = Router(name="admin")
_broadcast_send_locks: dict[int, asyncio.Lock] = {}


class BroadcastDraft(StatesGroup):
    composing = State()
    choosing_photo = State()
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
        f"нажали «Удалить» {summary['delete_clicks']} · "
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


def _preview_text(
    text: str, storage: BotStorage, ttl_seconds: int, has_photo: bool = False,
    *, preview_body: str | None = None, page: int = 0, page_count: int = 1,
) -> str:
    recipients = storage.bot_user_stats()["subscribers"]
    page_label = f"Страница {page + 1} из {page_count}\n" if page_count > 1 else ""
    return (
        f"<b>Предпросмотр рассылки</b>\n\n"
        f"Формат: {'фото с подписью' if has_photo and text else 'фото' if has_photo else 'текст'} · "
        f"получателей: <b>{recipients}</b>\n"
        f"Символов: <b>{len(text)}</b> · удаление через <b>{format_broadcast_duration(ttl_seconds)}</b>\n"
        f"{page_label}\n"
        f"{preview_body if preview_body is not None else escape(text) or 'Без подписи'}\n\n"
        "Тест себе покажет сообщение без служебных строк."
    )


async def _get_draft_text(settings: Settings, state: FSMContext, telegram_user_id: int) -> str | None:
    if not is_admin(settings, telegram_user_id):
        return None
    data = await state.get_data()
    value = data.get("broadcast_text")
    try:
        validate_broadcast_content(value, data.get("broadcast_photo_file_id"))
        normalize_broadcast_entities(value, data.get("broadcast_entities"))
    except ValueError:
        return None
    return value


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


async def show_registration_notice_settings(bot, api, settings, storage, state, user_id, chat_id):
    await state.clear()
    config = storage.registration_notice_config()
    has_content = bool(config["text"] or config["photo_file_id"])
    text = (
        "<b>Сообщение после регистрации</b>\n\n"
        f"Отправка: <b>{'включена' if config['enabled'] else 'отключена'}</b>\n"
        "Только один раз после первого завершения регистрации в боте. "
        "Старым пользователям и при редактировании профиля не отправляется.\n\n"
    )
    if has_content:
        text += f"Удаление: через <b>{format_broadcast_duration(config['ttl_seconds'])}</b> после доставки.\n"
        text += "Сохранённое сообщение можно посмотреть, изменить или протестировать на себе."
    else:
        text += "Сообщение пока не настроено. Можно отправить текст или фото с подписью."
    await edit_panel_content(
        bot, storage, api, settings, user_id, "admin:registration", text,
        admin_registration_notice_keyboard(has_content, config["enabled"]), chat_id,
    )


async def show_broadcast_preview(bot, api, settings, storage, state, user_id, chat_id, page: int = 0) -> None:
    text = await _get_draft_text(settings, state, user_id)
    ttl_seconds = await _get_draft_duration(state)
    if text is None or ttl_seconds is None:
        return
    await state.set_state(BroadcastDraft.preview)
    data = await state.get_data()
    photo_file_id = data.get("broadcast_photo_file_id")
    pages = broadcast_preview_pages(text, data.get("broadcast_entities"))
    page = max(0, min(page, len(pages) - 1))
    chunk, entities = pages[page]
    preview_body = html_decoration.unparse(chunk, [MessageEntity.model_validate(value) for value in entities]) or "Без подписи"
    registration = data.get("broadcast_target") == "registration"
    if registration:
        page_label = f"Страница {page + 1} из {len(pages)}\n" if len(pages) > 1 else ""
        preview_text = (
            "<b>Предпросмотр сообщения после регистрации</b>\n\n"
            "Получатель: новый пользователь после первой регистрации.\n"
            f"Удаление через <b>{format_broadcast_duration(ttl_seconds)}</b> после доставки.\n"
            f"{page_label}\n{preview_body}\n\n"
            "«Сохранить и включить» применит сообщение для будущих регистраций."
        )
    else:
        preview_text = _preview_text(text, storage, ttl_seconds, bool(photo_file_id), preview_body=preview_body, page=page, page_count=len(pages))
    await edit_panel_content(
        bot, storage, api, settings, user_id, "admin:broadcast:preview",
        preview_text,
        admin_preview_keyboard(bool(photo_file_id), page, len(pages), registration=True) if registration else admin_preview_keyboard(bool(photo_file_id), page, len(pages)), chat_id,
        media_photo=photo_file_id,
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
    if action in {"registration", "registration:disable", "registration:remove"}:
        if action == "registration:disable":
            storage.disable_registration_notice()
        elif action == "registration:remove":
            storage.remove_registration_notice()
        await show_registration_notice_settings(callback.bot, api, settings, storage, state, callback.from_user.id, chat_id)
        return
    if action in {"registration:edit", "registration:preview"}:
        config = storage.registration_notice_config()
        await state.clear()
        await state.update_data(
            broadcast_target="registration", broadcast_text=config["text"],
            broadcast_photo_file_id=config["photo_file_id"], broadcast_entities=config["entities"],
            broadcast_ttl_seconds=config["ttl_seconds"] if config["text"] or config["photo_file_id"] else None,
        )
        if action == "registration:preview" and (config["text"] or config["photo_file_id"]):
            await show_broadcast_preview(callback.bot, api, settings, storage, state, callback.from_user.id, chat_id)
        else:
            await state.set_state(BroadcastDraft.composing)
            await edit_panel_content(
                callback.bot, storage, api, settings, callback.from_user.id, "admin:registration:compose",
                "<b>Сообщение после регистрации</b>\n\nОтправь текст или одну картинку с подписью. "
                "Можно использовать форматирование Telegram. Затем выбери время до удаления. "
                "Отправка начнётся только после «Сохранить и включить».",
                admin_compose_keyboard(), chat_id,
            )
        return
    if action == "registration:save":
        lock = _broadcast_send_locks.setdefault(callback.from_user.id, asyncio.Lock())
        async with lock:
            data = await state.get_data()
            if data.get("broadcast_target") != "registration" or await state.get_state() != BroadcastDraft.preview.state:
                return
            text = await _get_draft_text(settings, state, callback.from_user.id)
            ttl = await _get_draft_duration(state)
            if text is None or ttl is None:
                return
            storage.save_registration_notice(text, ttl, photo_file_id=data.get("broadcast_photo_file_id"), entities=data.get("broadcast_entities"))
            await state.clear()
        await show_registration_notice_settings(callback.bot, api, settings, storage, state, callback.from_user.id, chat_id)
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
            "<b>Новая рассылка</b>\n\nОтправь текст объявления или одну картинку с подписью. "
            "Подпись к картинке — до 1024 символов, обычный текст — до 4096. Затем выбери срок удаления. "
            "Можно использовать форматирование Telegram: жирный текст, курсив, ссылки и спойлеры. "
            "Сообщение получат пользователи, которые запускали бота и не заблокировали его.",
            admin_compose_keyboard(),
            chat_id,
        )
        return
    if action == "broadcast:edit":
        if await _get_draft_text(settings, state, callback.from_user.id) is None:
            return
        data = await state.get_data()
        await state.set_state(BroadcastDraft.composing)
        title = "Изменить сообщение после регистрации" if data.get("broadcast_target") == "registration" else "Изменить рассылку"
        await edit_panel_content(
            callback.bot,
            storage,
            api,
            settings,
            callback.from_user.id,
            "admin:broadcast:compose",
            f"<b>{title}</b>\n\nОтправь новый текст. Если в сообщении есть картинка, "
            "он станет подписью к ней (до 1024 символов). Можно отправить новую картинку с подписью.",
            admin_compose_keyboard(),
            chat_id,
        )
        await state.update_data(
            broadcast_text=data.get("broadcast_text"),
            broadcast_ttl_seconds=data.get("broadcast_ttl_seconds"),
        )
        return
    if action == "broadcast:preview":
        await show_broadcast_preview(callback.bot, api, settings, storage, state, callback.from_user.id, chat_id)
        return
    if action.startswith("broadcast:page:"):
        value = action.removeprefix("broadcast:page:")
        if value.isdecimal() and await state.get_state() == BroadcastDraft.preview.state:
            await show_broadcast_preview(callback.bot, api, settings, storage, state, callback.from_user.id, chat_id, int(value))
        return
    if action == "broadcast:photo":
        if await _get_draft_text(settings, state, callback.from_user.id) is None:
            return
        await state.set_state(BroadcastDraft.choosing_photo)
        await edit_panel_content(
            callback.bot, storage, api, settings, callback.from_user.id, "admin:broadcast:compose",
            "<b>Картинка для рассылки</b>\n\nОтправь одну картинку как фото. "
            "Добавь подпись, чтобы заменить текст; без подписи сохранится текущий текст. "
            "Подпись — до 1024 символов.",
            admin_compose_keyboard(back_to_preview=True), chat_id,
        )
        return
    if action == "broadcast:photo:remove":
        if await _get_draft_text(settings, state, callback.from_user.id) is None:
            return
        await state.update_data(broadcast_photo_file_id=None)
        if await _get_draft_text(settings, state, callback.from_user.id) is not None:
            await show_broadcast_preview(callback.bot, api, settings, storage, state, callback.from_user.id, chat_id)
        else:
            await state.set_state(BroadcastDraft.composing)
            await edit_panel_content(
                callback.bot, storage, api, settings, callback.from_user.id, "admin:broadcast:compose",
                "Картинка убрана. Отправь текст объявления или новую картинку с подписью.",
                admin_compose_keyboard(), chat_id,
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
        photo_file_id = (await state.get_data()).get("broadcast_photo_file_id")
        entities = (await state.get_data()).get("broadcast_entities")
        if (await state.get_data()).get("broadcast_target") == "registration":
            test_message = await send_registration_message(callback.bot, callback.from_user.id, {"text": text, "photo_file_id": photo_file_id, "entities": entities or []})
        else:
            test_message = await send_broadcast_message(callback.bot, callback.from_user.id, text, photo_file_id, entities)
        storage.add_temporary_message(callback.from_user.id, test_message.chat.id, test_message.message_id, ttl_seconds)
        return
    if action == "broadcast:send":
        lock = _broadcast_send_locks.setdefault(callback.from_user.id, asyncio.Lock())
        async with lock:
            if (await state.get_data()).get("broadcast_target") == "registration":
                return
            text = await _get_draft_text(settings, state, callback.from_user.id)
            ttl_seconds = await _get_draft_duration(state)
            if text is None or ttl_seconds is None or await state.get_state() != BroadcastDraft.preview.state:
                return
            photo_file_id = (await state.get_data()).get("broadcast_photo_file_id")
            entities = (await state.get_data()).get("broadcast_entities")
            if photo_file_id or entities:
                campaign_id, recipient_count = storage.create_broadcast(
                    callback.from_user.id, text, ttl_seconds,
                    **({"photo_file_id": photo_file_id} if photo_file_id else {}),
                    **({"entities": entities} if entities else {}),
                )
            else:
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


@router.callback_query(F.data.startswith("broadcast:delete:"))
async def delete_broadcast_notification(
    callback: CallbackQuery,
    settings: Settings,
    storage: BotStorage,
) -> None:
    message = callback.message
    if (
        message is None
        or message.chat.type != "private"
        or callback.from_user is None
        or message.chat.id != callback.from_user.id
    ):
        await callback.answer("Эта кнопка доступна только получателю сообщения")
        return

    value = (callback.data or "").removeprefix("broadcast:delete:")
    if value == "test":
        if not is_admin(settings, callback.from_user.id):
            await callback.answer("Нет доступа", show_alert=True)
            return
    elif value.isdecimal() and int(value) > 0:
        recorded = storage.record_broadcast_delete_click(
            int(value), callback.from_user.id, message.chat.id, message.message_id,
        )
        if recorded is None:
            await callback.answer("Эта кнопка больше не действует")
            return
    else:
        await callback.answer("Эта кнопка больше не действует")
        return

    try:
        await callback.bot.delete_message(message.chat.id, message.message_id)
    except TelegramAPIError:
        await callback.answer("Не получилось удалить сообщение. Попробуй ещё раз.")
        return
    storage.remove_temporary_message(message.chat.id, message.message_id)
    await callback.answer("Сообщение удалено")


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
    text = message.text or ""
    if not text.strip():
        return
    photo_file_id = (await state.get_data()).get("broadcast_photo_file_id")
    try:
        validate_broadcast_content(text, photo_file_id)
        entities = normalize_broadcast_entities(text, getattr(message, "entities", None))
    except ValueError as error:
        await edit_panel_content(
            message.bot,
            storage,
            api,
            settings,
            message.from_user.id,
            "admin:broadcast:compose",
            escape(str(error)),
            admin_compose_keyboard(),
            message.chat.id,
        )
        return
    await state.update_data(broadcast_text=text, broadcast_entities=entities)
    if await _get_draft_duration(state) is None:
        await show_duration_picker(message.bot, api, settings, storage, state, message.from_user.id, message.chat.id)
    else:
        await show_broadcast_preview(message.bot, api, settings, storage, state, message.from_user.id, message.chat.id)


@router.message(BroadcastDraft.composing, F.photo)
@router.message(BroadcastDraft.choosing_photo, F.photo)
async def receive_broadcast_photo(
    message: Message, state: FSMContext, api: OpiniaApi, settings: Settings, storage: BotStorage,
) -> None:
    if message.chat.type != "private" or message.from_user is None or not is_admin(settings, message.from_user.id):
        await state.clear()
        return
    if message.media_group_id:
        await edit_panel_content(
            message.bot, storage, api, settings, message.from_user.id, "admin:broadcast:compose",
            "Отправь одну картинку отдельным сообщением. Альбомы в рассылке не поддерживаются.",
            admin_compose_keyboard(), message.chat.id,
        )
        return
    data = await state.get_data()
    if message.caption is not None:
        text = message.caption
        source_entities = getattr(message, "caption_entities", None)
    else:
        text = data.get("broadcast_text") or ""
        source_entities = data.get("broadcast_entities")
    photo_file_id = message.photo[-1].file_id
    try:
        validate_broadcast_content(text, photo_file_id)
        entities = normalize_broadcast_entities(text, source_entities)
    except ValueError as error:
        await edit_panel_content(
            message.bot, storage, api, settings, message.from_user.id, "admin:broadcast:compose",
            escape(str(error)), admin_compose_keyboard(), message.chat.id,
        )
        return
    await state.update_data(broadcast_text=text, broadcast_photo_file_id=photo_file_id, broadcast_entities=entities)
    if await _get_draft_duration(state) is None:
        await show_duration_picker(message.bot, api, settings, storage, state, message.from_user.id, message.chat.id)
    else:
        await show_broadcast_preview(message.bot, api, settings, storage, state, message.from_user.id, message.chat.id)


@router.message(BroadcastDraft.composing, ~F.text.startswith("/"))
@router.message(BroadcastDraft.choosing_photo, ~F.text.startswith("/"))
async def receive_unsupported_broadcast_content(
    message: Message, state: FSMContext, api: OpiniaApi, settings: Settings, storage: BotStorage,
) -> None:
    if message.chat.type != "private" or message.from_user is None or not is_admin(settings, message.from_user.id):
        await state.clear()
        return
    await edit_panel_content(
        message.bot, storage, api, settings, message.from_user.id, "admin:broadcast:compose",
        "Отправь одну картинку как фото, а не файл, видео или альбом. "
        "Для обычного текста выбери «Изменить текст» в предпросмотре.",
        admin_compose_keyboard(back_to_preview=await _get_draft_text(settings, state, message.from_user.id) is not None),
        message.chat.id,
    )


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
