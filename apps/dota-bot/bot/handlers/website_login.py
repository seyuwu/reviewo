import re
from html import escape

from aiogram import F, Router
from aiogram.filters import CommandStart
from aiogram.types import ForceReply, InlineKeyboardButton, InlineKeyboardMarkup, Message

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

    if storage.get_session(telegram_user_id) is None:
        await send_temporary_notification(
            message.bot,
            storage,
            telegram_user_id,
            message.chat.id,
            "<b>Сначала подключите Telegram к аккаунту Opinia</b>\n\n"
            "Войдите на сайте по email, откройте профиль и нажмите «Привязать Telegram». "
            "После привязки снова нажмите «Войти через Telegram».",
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
    await send_temporary_notification(
        message.bot,
        storage,
        telegram_user_id,
        message.chat.id,
        "<b>Вход в Opinia</b>\n\n"
        "Откройте страницу входа и отправьте сюда ответом на это сообщение шестизначный код с сайта. "
        "Не вводите код, если вы сами не начинали вход.\n\n"
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
    await send_temporary_notification(
        message.bot,
        storage,
        user_id,
        message.chat.id,
        "<b>Подключить FDP к аккаунту Opinia?</b>\n\n"
        "Откройте вкладку турниров на сайте и отправьте сюда ответом на это сообщение шестизначный код. "
        "Так бот убедится, что привязку начал владелец аккаунта.\n\n"
        f"Запрос: <code>tournament_link_{escape(request_id)}</code>",
        300,
        reply_markup=ForceReply(selective=True, input_field_placeholder="Код с сайта"),
        parse_mode="HTML",
        disable_web_page_preview=True,
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
    tournament_link = _TOURNAMENT_LINK_ID.search(prompt)
    if not web_login and not tournament_link:
        return

    telegram_user_id = message.from_user.id
    verification_code = (message.text or "").strip()
    if web_login:
        request_id = web_login.group(1)
        try:
            await api.confirm_telegram_browser_login(telegram_user_id, request_id, verification_code)
        except ApiError as error:
            if error.status in {400, 401, 404, 429}:
                text = (
                    "Код не подошёл, запрос истёк или Telegram не привязан к аккаунту Opinia. "
                    "Проверьте код на сайте и ответьте ещё раз на исходное сообщение."
                )
            else:
                text = "Не получилось подтвердить вход. Попробуйте начать его заново на сайте."
            await message.reply(text)
            return

        await message.reply("✅ Вход подтверждён. Вернитесь на сайт — аккаунт уже открывается.")
        return

    request_id = tournament_link.group(1)
    try:
        auth = await api.confirm_telegram_tournament_link(
            request_id,
            telegram_user_id,
            message.from_user.username,
            verification_code,
        )
        storage.save_session(telegram_user_id, auth["accessToken"], auth["refreshToken"])
    except ApiError as error:
        if error.status == 409:
            text = "Этот аккаунт Telegram или Opinia уже связан с другой учётной записью. Ничего не изменено."
        elif error.status in {400, 401, 404, 429}:
            text = "Код не подошёл или запрос истёк. Проверьте код на сайте и ответьте ещё раз на исходное сообщение."
        else:
            text = "Не удалось подключить аккаунт. Попробуйте начать подключение заново на сайте."
        await message.reply(text)
        return

    await edit_panel(
        message.bot,
        storage,
        api,
        settings,
        telegram_user_id,
        "home",
        message.chat.id,
        force_new_message=True,
    )


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
