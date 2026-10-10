import logging

from aiogram import F, Router
from aiogram.exceptions import TelegramAPIError
from aiogram.types import CallbackQuery

from ..services.callbacks import acknowledge_callback
from ..services.referral_sharing import (
    REFERRAL_INVITATION_TTL_SECONDS,
    REFERRAL_SHARE_CALLBACK,
    referral_invitation_text,
)
from ..services.start_links import bot_friend_invite_url
from ..storage.database import BotStorage

router = Router(name="welcome-sharing")
logger = logging.getLogger(__name__)
_pending_users: set[int] = set()
_NOTICE_CHOICE = "welcome_share_notice"


@router.callback_query(F.data == REFERRAL_SHARE_CALLBACK)
async def share_welcome_invitation(callback: CallbackQuery, storage: BotStorage) -> None:
    user_id = callback.from_user.id
    if (callback.message is None or callback.message.chat.type != "private"
            or callback.message.chat.id != user_id):
        acknowledge_callback(callback)
        return
    if user_id in _pending_users:
        acknowledge_callback(callback, "Приглашение уже готовится…")
        return

    _pending_users.add(user_id)
    try:
        previous = storage.get_choice(user_id, _NOTICE_CHOICE, 0)
        if previous and storage.is_temporary_message(user_id, previous["messageId"]):
            acknowledge_callback(callback, "Приглашение уже ниже. Выбери у него «Переслать».")
            return
        me = await callback.bot.me()
        if not me.username:
            acknowledge_callback(callback, "Не удалось создать ссылку. Попробуй ещё раз.")
            return
        code = storage.referral_code(user_id, callback.from_user.full_name, callback.from_user.username)
        link = bot_friend_invite_url(me.username, code)
        # This must appear while the welcome is still visible, without waiting
        # for the serializer used by ordinary temporary notifications.
        message = await callback.bot.send_message(
            user_id, referral_invitation_text(link), parse_mode=None,
            disable_web_page_preview=True,
        )
        storage.add_temporary_message(
            user_id, message.chat.id, message.message_id, REFERRAL_INVITATION_TTL_SECONDS,
        )
        storage.set_choices(user_id, _NOTICE_CHOICE, [{"messageId": message.message_id}])
        acknowledge_callback(
            callback, "Выбери «Переслать» у сообщения ниже и отметь друзей. Оно удалится через 10 секунд.",
        )
    except TelegramAPIError:
        logger.warning("Could not send welcome referral invitation")
        acknowledge_callback(callback, "Не удалось отправить приглашение. Попробуй ещё раз.")
    finally:
        _pending_users.discard(user_id)
