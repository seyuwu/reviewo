import re
from html import escape

from aiogram import F, Router
from aiogram.exceptions import TelegramAPIError
from aiogram.filters import CommandStart
from aiogram.types import CallbackQuery, ForceReply, InlineKeyboardButton, InlineKeyboardMarkup, Message

from ..api.client import ApiError, OpiniaApi
from ..config import Settings
from ..services.panel import edit_panel
from ..services.temporary_notifications import send_temporary_notification
from ..storage.database import BotStorage

router = Router(name="website-login")
_REQUEST_ID = re.compile(r"web_login_([a-f0-9]{32})")
_TOURNAMENT_LINK_ID = re.compile(r"tournament_link_([a-f0-9]{32})")


@router.message(
    CommandStart(deep_link=True),
    F.text.regexp(r"^/start(?:@\w+)?\s+web_login_[a-f0-9]{32}$"),
)
async def start_website_login(
    message: Message,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    if message.chat.type != "private" or message.from_user is None:
        return

    match = _REQUEST_ID.search(message.text or "")
    if match is None:
        return
    telegram_user_id = message.from_user.id
    request_id = match.group(1)
    storage.record_bot_user(
        telegram_user_id,
        "direct",
        display_name=message.from_user.full_name,
        username=message.from_user.username,
    )

    try:
        # Rehydrate the bot session from the Telegram identity. This also supports
        # browser login after the bot's local session cache has been cleared.
        auth = await api.login_telegram_bot_session(telegram_user_id)
        storage.save_session(telegram_user_id, auth["accessToken"], auth["refreshToken"])
    except ApiError:
        await send_temporary_notification(
            message.bot,
            storage,
            telegram_user_id,
            message.chat.id,
            "<b>Сначала подключите Telegram к аккаунту Opinia</b>\n\n"
            "Для входа этому Telegram сначала нужно связать с аккаунтом FDP. "
            "Войдите на сайте другим способом, откройте профиль и подключите Telegram.",
            90,
            reply_markup=InlineKeyboardMarkup(
                inline_keyboard=[
                    [InlineKeyboardButton(text="Открыть профиль Opinia", url=f"{settings.site_url}/profile")],
                    [InlineKeyboardButton(text="Как привязать аккаунт", callback_data="account:help")],
                ]
            ),
            parse_mode="HTML",
            disable_web_page_preview=True,
        )
        return

    try:
        preview = await api.preview_telegram_browser_login(telegram_user_id, request_id)
    except ApiError:
        await send_temporary_notification(
            message.bot,
            storage,
            telegram_user_id,
            message.chat.id,
            "Ссылка входа истекла или не работает. Вернитесь на сайт и начните вход через Telegram заново.",
            30,
            parse_mode="HTML",
        )
        return

    if preview.get("valid") is not True:
        return
    account = preview.get("account") if isinstance(preview.get("account"), dict) else {}
    account_name = escape(str(account.get("displayName") or "аккаунт FDP"))
    account_username = account.get("username")
    account_label = f"<b>{account_name}</b>"
    if isinstance(account_username, str) and account_username:
        account_label += f" (@{escape(account_username)})"
    await send_temporary_notification(
        message.bot,
        storage,
        telegram_user_id,
        message.chat.id,
        "<b>Вход на сайт через FDP</b>\n\n"
        f"Сейчас на сайте будет открыт аккаунт FDP, связанный с этим Telegram: {account_label}.\n\n"
        "Чтобы подтвердить вход именно из открытой страницы, отправьте сюда ответом на это сообщение "
        "шестизначный код с сайта. Не передавайте код другим людям.\n\n"
        f"Запрос: <code>web_login_{escape(request_id)}</code>",
        300,
        reply_markup=ForceReply(selective=True, input_field_placeholder="Код с сайта"),
        parse_mode="HTML",
        disable_web_page_preview=True,
    )


@router.message(
    CommandStart(deep_link=True),
    F.text.regexp(r"^/start(?:@\w+)?\s+tournament_link_[a-f0-9]{32}$"),
)
async def start_tournament_bot_link(
    message: Message,
    api: OpiniaApi,
    storage: BotStorage,
) -> None:
    if message.chat.type != "private" or message.from_user is None:
        return
    match = _TOURNAMENT_LINK_ID.search(message.text or "")
    if match is None:
        return

    request_id = match.group(1)
    user_id = message.from_user.id
    storage.record_bot_user(
        user_id,
        "direct",
        display_name=message.from_user.full_name,
        username=message.from_user.username,
    )
    try:
        preview = await api.preview_telegram_tournament_link(request_id)
    except ApiError:
        await send_temporary_notification(
            message.bot,
            storage,
            user_id,
            message.chat.id,
            "Ссылка подключения истекла. Вернитесь на вкладку турниров и начните подключение заново.",
            30,
            parse_mode="HTML",
        )
        return

    if preview.get("valid") is not True:
        return
    account = preview.get("account") if isinstance(preview.get("account"), dict) else {}
    account_name = escape(str(account.get("displayName") or "аккаунтом Opinia"))
    account_username = account.get("username")
    account_label = f"<b>{account_name}</b>"
    if isinstance(account_username, str) and account_username:
        account_label += f" (@{escape(account_username)})"
    await send_temporary_notification(
        message.bot,
        storage,
        user_id,
        message.chat.id,
        "<b>Подключить Telegram к аккаунту сайта?</b>\n\n"
        f"Telegram будет связан с аккаунтом {account_label}. После подтверждения откроется главное меню FDP.\n\n"
        "Если это не ваш аккаунт, не подтверждайте привязку.",
        300,
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="✅ Подтверждаю", callback_data=f"tournament_link:confirm:{request_id}")],
        ]),
        parse_mode="HTML",
        disable_web_page_preview=True,
    )


@router.callback_query(F.data.regexp(r"^tournament_link:confirm:[a-f0-9]{32}$"))
async def confirm_telegram_tournament_link(
    callback: CallbackQuery,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    if callback.message is None or callback.message.chat.type != "private" or callback.from_user is None:
        await callback.answer("Откройте FDP в личном чате с ботом.", show_alert=True)
        return

    request_id = (callback.data or "").rsplit(":", 1)[-1]
    telegram_user_id = callback.from_user.id
    try:
        auth = await api.confirm_telegram_tournament_link(
            request_id,
            telegram_user_id,
            callback.from_user.username,
        )
        storage.save_session(telegram_user_id, auth["accessToken"], auth["refreshToken"])
    except ApiError as error:
        if error.status == 409:
            text = "Этот Telegram или аккаунт сайта уже связан с другой учётной записью. Перенос не выполнен."
        elif error.status in {400, 401, 404, 429}:
            text = "Запрос истёк или привязка уже обработана. Вернитесь на сайт и начните заново."
        else:
            text = "Не удалось связать аккаунты. Попробуйте начать подключение заново на сайте."
        await callback.answer(text, show_alert=True)
        return

    await callback.answer("Аккаунты связаны")
    try:
        await callback.message.edit_text("✅ Аккаунты связаны. Открываю главное меню FDP.")
    except TelegramAPIError:
        pass
    await edit_panel(
        callback.bot,
        storage,
        api,
        settings,
        telegram_user_id,
        "home",
        callback.message.chat.id,
        force_new_message=True,
    )


@router.message(F.reply_to_message, F.text.regexp(r"^\d{6}$"))
async def submit_telegram_confirmation_code(
    message: Message,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    if message.chat.type != "private" or message.from_user is None or message.reply_to_message is None:
        return

    prompt = message.reply_to_message.text or ""
    web_login = _REQUEST_ID.search(prompt)
    if not web_login:
        return

    telegram_user_id = message.from_user.id
    verification_code = (message.text or "").strip()
    request_id = web_login.group(1)
    try:
        await api.confirm_telegram_browser_login(telegram_user_id, request_id, verification_code)
    except ApiError as error:
        if error.status in {400, 401, 404, 429}:
            text = (
                "Код не подошёл, запрос истёк или Telegram не привязан к этому аккаунту FDP. "
                "Проверьте код на сайте и ответьте ещё раз на исходное сообщение."
            )
        else:
            text = "Не получилось подтвердить вход. Попробуйте начать его заново на сайте."
        await message.reply(text)
        return

    await message.reply("✅ Вход подтверждён. Вернитесь на сайт — аккаунт уже открывается.")


@router.message(
    CommandStart(deep_link=True),
    F.text.regexp(r"^/start(?:@\w+)?\s+web_session$"),
)
async def open_telegram_bot_session(
    message: Message,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    if message.chat.type != "private" or message.from_user is None:
        return
    user_id = message.from_user.id
    storage.record_bot_user(
        user_id,
        "direct",
        display_name=message.from_user.full_name,
        username=message.from_user.username,
    )
    try:
        # Refresh from the linked website identity so an old bot session cannot open
        # a different FDP account than the one associated with this Telegram user.
        auth = await api.login_telegram_bot_session(user_id)
    except ApiError:
        await send_temporary_notification(
            message.bot,
            storage,
            user_id,
            message.chat.id,
            "Сначала войдите в аккаунт Opinia на сайте и подключите FDP-бот через вкладку турниров.",
            45,
            reply_markup=InlineKeyboardMarkup(
                inline_keyboard=[
                    [InlineKeyboardButton(text="Открыть турниры", url=f"{settings.site_url}/games/tournaments")]
                ]
            ),
            parse_mode="HTML",
            disable_web_page_preview=True,
        )
        return
    storage.save_session(user_id, auth["accessToken"], auth["refreshToken"])

    await edit_panel(message.bot, storage, api, settings, user_id, "home", message.chat.id)
    try:
        await message.delete()
    except TelegramAPIError:
        # The home panel is already open; Telegram may refuse to delete the command.
        pass
