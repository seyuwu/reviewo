import re

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message

from ..api.client import ApiError, OpiniaApi
from ..config import Settings
from ..services.panel import edit_panel
from ..storage.database import BotStorage

router = Router(name="registration")


class GuestProfileWizard(StatesGroup):
    display_name = State()
    mmr = State()
    roles = State()


@router.callback_query(F.data == "register:start")
async def begin_registration(callback: CallbackQuery, state: FSMContext) -> None:
    await callback.answer()
    await state.set_state(GuestProfileWizard.display_name)
    await callback.message.answer("Как показывать ваше имя в профиле Dota? Напишите имя сообщением.")


@router.message(GuestProfileWizard.display_name)
async def receive_display_name(message: Message, state: FSMContext) -> None:
    value = (message.text or "").strip()
    if not value or len(value) > 80:
        await message.answer("Имя должно быть длиной от 1 до 80 символов. Попробуйте ещё раз.")
        return
    await state.update_data(display_name=value)
    await state.set_state(GuestProfileWizard.mmr)
    await message.answer("Укажите MMR числом от 0 до 18000.")


@router.message(GuestProfileWizard.mmr)
async def receive_mmr(message: Message, state: FSMContext) -> None:
    value = (message.text or "").strip().replace(" ", "")
    if not value.isdigit() or not 0 <= int(value) <= 18000:
        await message.answer("Нужен MMR числом от 0 до 18000. Попробуйте ещё раз.")
        return
    await state.update_data(mmr=value)
    await state.set_state(GuestProfileWizard.roles)
    await message.answer("Какие позиции играете? Перечислите номера через запятую: 1, 2, 3, 4, 5.")


@router.message(GuestProfileWizard.roles)
async def receive_roles(
    message: Message,
    state: FSMContext,
    api: OpiniaApi,
    settings: Settings,
    storage: BotStorage,
) -> None:
    roles = list(dict.fromkeys(re.findall(r"[1-5]", message.text or "")))
    if not roles:
        await message.answer("Выберите хотя бы одну позицию: например, 1, 4.")
        return
    form = await state.get_data()
    recovery_url = None
    try:
        profile = {
            "title": form["display_name"],
            "mmr": form["mmr"],
            "roles": roles,
            "server": "EU",
        }
        if storage.get_session(message.from_user.id):
            await api.user(message.from_user.id, "POST", "/dota/profiles", profile)
            recovery_url = None
        else:
            created = await api.public("POST", "/dota/profiles/guest", profile)
            storage.save_session(
                message.from_user.id,
                created["accessToken"],
                created["refreshToken"],
                created["recoveryUrl"],
            )
            recovery_url = created["recoveryUrl"]
            linked = await api.link_guest_account(created["accessToken"], message.from_user.id)
            storage.save_session(
                message.from_user.id,
                linked["accessToken"],
                linked["refreshToken"],
                recovery_url,
            )
        await state.clear()
        await edit_panel(
            message.bot, storage, api, settings, message.from_user.id, "home", message.chat.id
        )
        if recovery_url:
            recovery = await message.answer(
                "Профиль готов. Сохраните ссылку восстановления аккаунта:\n" + recovery_url,
                disable_web_page_preview=True,
            )
            storage.add_temporary_message(message.from_user.id, recovery.chat.id, recovery.message_id, 300)
    except ApiError as error:
        await state.clear()
        if recovery_url and storage.get_session(message.from_user.id):
            await edit_panel(
                message.bot, storage, api, settings, message.from_user.id, "home", message.chat.id
            )
            await message.answer(
                "Профиль создан, но привязка Telegram не завершилась. Сохраните ссылку восстановления "
                "и откройте профиль Opinia, чтобы завершить привязку:\n" + recovery_url,
                disable_web_page_preview=True,
            )
        else:
            await message.answer(f"Не получилось создать профиль: {error}\nНачните снова через /start.")
