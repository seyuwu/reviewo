import asyncio
from html import escape

from aiogram import Bot, F, Router
from aiogram.filters import Command, CommandStart
from aiogram.filters.command import CommandObject
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message, User

from .config import Settings
from .storage import IncomingUser, WaitlistStorage, WaitlistUser


router = Router(name="waitlist")
pending_broadcasts: dict[int, str] = {}


@router.message(CommandStart())
async def handle_start(
    message: Message,
    command: CommandObject,
    settings: Settings,
    storage: WaitlistStorage,
) -> None:
    telegram_user = get_required_user(message)
    result = storage.upsert_user(to_incoming_user(telegram_user), command.args)

    await message.answer(
        build_start_message(result.user, result.created),
        reply_markup=build_main_keyboard(settings),
        parse_mode="HTML",
    )


@router.message(Command("status"))
async def handle_status(message: Message, storage: WaitlistStorage) -> None:
    telegram_user = get_required_user(message)
    waitlist_user = storage.get_user(telegram_user.id)

    if waitlist_user is None:
        await message.answer("Вы пока не в waitlist. Нажмите /start, чтобы присоединиться.")
        return

    await message.answer(build_status_message(waitlist_user), parse_mode="HTML")


@router.message(Command("stop"))
async def handle_stop(message: Message, storage: WaitlistStorage) -> None:
    telegram_user = get_required_user(message)
    waitlist_user = storage.stop_notifications(telegram_user.id)

    if waitlist_user is None:
        await message.answer("Вы пока не в waitlist. Если хотите присоединиться, нажмите /start.")
        return

    await message.answer(
        "Ок, уведомления отключены. Вы остались в waitlist, но мы не будем писать вам до нового /start."
    )


@router.message(Command("help"))
async def handle_help(message: Message, settings: Settings) -> None:
    await message.answer(
        "\n".join(
            [
                "<b>Opinia waitlist</b>",
                "",
                "/start — попасть в waitlist и получить номер",
                "/status — проверить своё место",
                "/stop — отключить будущие уведомления",
                "/help — эта справка",
                "",
                f"Канал: {escape(settings.channel_url)}",
                f"Поддержка: {escape(settings.support_url)}",
            ]
        ),
        reply_markup=build_main_keyboard(settings),
        parse_mode="HTML",
    )


@router.message(Command("stats"))
async def handle_stats(message: Message, settings: Settings, storage: WaitlistStorage) -> None:
    telegram_user = get_required_user(message)

    if telegram_user.id not in settings.admin_ids:
        await message.answer("Команда доступна только администратору.")
        return

    stats = storage.get_stats()
    source_lines = [f"• {escape(source)}: {count}" for source, count in stats.by_source]
    source_block = "\n".join(source_lines) if source_lines else "Пока нет источников."

    await message.answer(
        "\n".join(
            [
                "<b>Waitlist stats</b>",
                f"Всего: <b>{stats.total}</b>",
                f"Сегодня: <b>{stats.joined_today}</b>",
                f"С уведомлениями: <b>{stats.notifications_enabled}</b>",
                "",
                "<b>Источники</b>",
                source_block,
            ]
        ),
        parse_mode="HTML",
    )


@router.message(Command("broadcast"))
async def handle_broadcast(
    message: Message,
    command: CommandObject,
    settings: Settings,
    storage: WaitlistStorage,
) -> None:
    telegram_user = get_required_user(message)

    if telegram_user.id not in settings.admin_ids:
        await message.answer("Команда доступна только администратору.")
        return

    broadcast_text = (command.args or "").strip()
    if not broadcast_text:
        await message.answer(
            "Напишите текст рассылки после команды.\n\n"
            "Пример:\n"
            "/broadcast Ранний доступ к Opinia открыт!\n"
            "https://opinia.ru"
        )
        return

    if len(broadcast_text) > 4000:
        await message.answer("Текст рассылки слишком длинный. Ограничение: 4000 символов.")
        return

    recipients_count = len(storage.get_active_user_ids())
    pending_broadcasts[telegram_user.id] = broadcast_text

    await message.answer(
        build_broadcast_preview(broadcast_text, recipients_count),
        reply_markup=build_broadcast_confirm_keyboard(),
        parse_mode="HTML",
    )


@router.callback_query(F.data == "broadcast:send")
async def handle_broadcast_send(
    callback: CallbackQuery,
    bot: Bot,
    settings: Settings,
    storage: WaitlistStorage,
) -> None:
    telegram_user = callback.from_user

    if telegram_user.id not in settings.admin_ids:
        await callback.answer("Недоступно", show_alert=True)
        return

    broadcast_text = pending_broadcasts.pop(telegram_user.id, None)
    if broadcast_text is None:
        await callback.answer("Рассылка не найдена или уже отправлена.", show_alert=True)
        return

    recipient_ids = storage.get_active_user_ids()
    await callback.answer("Рассылка запущена.")

    if callback.message is not None:
        await callback.message.edit_text(
            f"Рассылка запущена.\nПолучателей: {len(recipient_ids)}",
        )

    sent = 0
    failed = 0

    for recipient_id in recipient_ids:
        try:
            await bot.send_message(recipient_id, broadcast_text)
            sent += 1
        except Exception:
            failed += 1

        await asyncio.sleep(0.05)

    if callback.message is not None:
        await callback.message.answer(
            "\n".join(
                [
                    "<b>Рассылка завершена</b>",
                    f"Отправлено: <b>{sent}</b>",
                    f"Ошибок: <b>{failed}</b>",
                ]
            ),
            parse_mode="HTML",
        )


@router.callback_query(F.data == "broadcast:cancel")
async def handle_broadcast_cancel(callback: CallbackQuery, settings: Settings) -> None:
    telegram_user = callback.from_user

    if telegram_user.id not in settings.admin_ids:
        await callback.answer("Недоступно", show_alert=True)
        return

    pending_broadcasts.pop(telegram_user.id, None)
    await callback.answer("Рассылка отменена.")

    if callback.message is not None:
        await callback.message.edit_text("Рассылка отменена.")


def build_start_message(waitlist_user: WaitlistUser, created: bool) -> str:
    greeting = "Вы в waitlist Opinia." if created else "Вы уже в waitlist Opinia."

    return "\n".join(
        [
            f"<b>{greeting}</b>",
            "",
            "<b>Если что-то существует — это можно оценить.</b>",
            "",
            "Opinia - платформа, где люди оценивают, делятся отзывами и обсуждают всё, "
            "что их окружает: сайты, приложения, компании, фильмы, игры, товары и многое другое.",
            "",
            "Сейчас основной фокус проекта - <b>рейтинг и обсуждение сайтов через браузерное расширение</b>, "
            "но возможности Opinia этим не ограничиваются.",
            "",
            "<b>Если у вас есть идеи, предложения или пожелания по развитию проекта</b> - пишите "
            "в личные сообщения поддержки. Мы внимательно читаем каждое сообщение и развиваем Opinia "
            "вместе с сообществом пользователей.",
            "",
            f"Ваш номер в очереди: <b>#{waitlist_user.waitlist_number}</b>",
            "",
            "Мы напишем, когда откроем ранний доступ.",
        ]
    )


def build_status_message(waitlist_user: WaitlistUser) -> str:
    joined_date = waitlist_user.joined_at.split("T", maxsplit=1)[0]

    return "\n".join(
        [
            "<b>Вы в waitlist Opinia</b>",
            f"Номер: <b>#{waitlist_user.waitlist_number}</b>",
            f"Дата записи: {escape(joined_date)}",
            f"Источник: {escape(waitlist_user.source)}",
        ]
    )


def build_main_keyboard(settings: Settings) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="Канал Opinia", url=settings.channel_url)],
            [InlineKeyboardButton(text="Поддержка", url=settings.support_url)],
        ]
    )


def build_broadcast_preview(broadcast_text: str, recipients_count: int) -> str:
    return "\n".join(
        [
            "<b>Предпросмотр рассылки:</b>",
            "",
            escape(broadcast_text),
            "",
            f"Получателей: <b>{recipients_count}</b>",
        ]
    )


def build_broadcast_confirm_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="Отправить", callback_data="broadcast:send"),
                InlineKeyboardButton(text="Отмена", callback_data="broadcast:cancel"),
            ]
        ]
    )


def get_required_user(message: Message) -> User:
    if message.from_user is None:
        raise RuntimeError("Telegram message has no sender.")

    return message.from_user


def to_incoming_user(user: User) -> IncomingUser:
    return IncomingUser(
        telegram_user_id=user.id,
        username=user.username,
        first_name=user.first_name,
        last_name=user.last_name,
        language_code=user.language_code,
        is_premium=bool(user.is_premium),
    )
