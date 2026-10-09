import asyncio
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock

from aiogram.fsm.context import FSMContext
from aiogram.fsm.storage.base import StorageKey
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import User
from cryptography.fernet import Fernet

from bot.api.client import ApiError
from bot.handlers.panel import start_panel
from bot.handlers.registration import (
    GuestProfileWizard, begin_registration, cancel_registration, choose_unranked_mmr,
    complete_registration, receive_mmr, retry_telegram_link, start_profile_registration,
    toggle_registration_role,
)
from bot.services.registration_drafts import registration_draft
from bot.storage.database import BotStorage


class SignupBot:
    """Only Telegram transport is replaced; panel rendering and storage are real."""

    def __init__(self):
        self.views = []
        self.delete_message = AsyncMock()

    async def send_photo(self, chat_id, photo, caption=None, reply_markup=None, **kwargs):
        self.views.append((caption, reply_markup))
        return SimpleNamespace(chat=SimpleNamespace(id=chat_id), message_id=20, photo=[])

    async def send_message(self, chat_id, text, reply_markup=None, **kwargs):
        self.views.append((text, reply_markup))
        return SimpleNamespace(chat=SimpleNamespace(id=chat_id), message_id=21, photo=[])

    async def edit_message_media(self, media, chat_id, message_id, reply_markup=None, **kwargs):
        self.views.append((media.caption, reply_markup))
        return SimpleNamespace(chat=SimpleNamespace(id=chat_id), message_id=message_id, photo=[])

    async def edit_message_text(self, text, chat_id, message_id, reply_markup=None, **kwargs):
        self.views.append((text, reply_markup))
        return SimpleNamespace(chat=SimpleNamespace(id=chat_id), message_id=message_id, photo=[])

    async def edit_message_caption(self, caption, chat_id, message_id, reply_markup=None, **kwargs):
        self.views.append((caption, reply_markup))
        return SimpleNamespace(chat=SimpleNamespace(id=chat_id), message_id=message_id, photo=[])


class RegistrationResumeTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.path = str(Path(self.folder.name) / "bot.db")
        self.key = Fernet.generate_key()
        self.storage = BotStorage(self.path, self.key)
        self.storage.initialize()
        self.memory = MemoryStorage()
        self.state = FSMContext(self.memory, StorageKey(bot_id=1, chat_id=7, user_id=7))
        self.bot = SignupBot()
        self.settings = SimpleNamespace(site_url="https://fdp.example")
        self.profile = None
        self.api = SimpleNamespace(
            public=AsyncMock(side_effect=self.create_profile),
            user=AsyncMock(side_effect=self.fetch_user),
            ensure_telegram_link=AsyncMock(),
        )
        self.wakeup = asyncio.Event()

    async def asyncTearDown(self):
        await asyncio.sleep(0)
        await self.memory.close()
        self.storage.close()
        self.folder.cleanup()

    async def create_profile(self, method, path, profile):
        self.profile = dict(profile)
        return {"accessToken": "access", "refreshToken": "refresh", "recoveryUrl": "https://fdp.example/recovery"}

    async def fetch_user(self, user_id, method, path, *args):
        if path == "/dota/profiles/me":
            if self.profile is None:
                raise ApiError("No profile", 404)
            return self.profile
        if path == "/social/parties/me":
            return {"parties": [], "invites": []}
        raise AssertionError("Unexpected account API call")

    def message(self, text="", user_id=7):
        return SimpleNamespace(
            text=text, bot=self.bot, delete=AsyncMock(),
            chat=SimpleNamespace(type="private", id=user_id),
            from_user=User(id=user_id, is_bot=False, first_name="Player", username="player"),
        )

    def callback(self, data, user_id=7):
        return SimpleNamespace(
            data=data, bot=self.bot, from_user=self.message(user_id=user_id).from_user,
            message=self.message(user_id=user_id), answer=AsyncMock(),
        )

    def buttons(self):
        return [button for row in self.bot.views[-1][1].inline_keyboard for button in row]

    async def start(self, **kwargs):
        await start_profile_registration(
            self.bot, self.state, self.api, self.settings, self.storage, 7, 7,
            telegram_name="player", **kwargs,
        )

    async def enter_mmr(self, value):
        await receive_mmr(self.message(value), self.state, self.api, self.settings, self.storage)

    async def select_role(self, role="3"):
        await toggle_registration_role(
            self.callback("register:toggle:" + role), self.state, self.storage, self.api, self.settings,
        )

    async def restart(self):
        self.storage.close()
        self.storage = BotStorage(self.path, self.key)
        self.storage.initialize()
        await self.memory.close()
        self.memory = MemoryStorage()
        self.state = FSMContext(self.memory, StorageKey(bot_id=1, chat_id=7, user_id=7))

    async def test_start_and_restart_offer_resume_with_mmr_roles_and_search_action(self):
        self.storage.set_choices(7, "pending_onboarding_action", [{"action": "looking"}])
        await self.start()
        await self.enter_mmr("3500")
        await self.select_role()
        await self.restart()
        await start_panel(self.message("/start"), self.bot, self.api, self.settings, self.storage, self.state)
        resume = next(button for button in self.buttons() if button.callback_data == "register:resume")
        self.assertIn("Продолжить регистрацию", resume.text)
        await begin_registration(self.callback("register:resume"), self.state, self.api, self.settings, self.storage)
        data = await self.state.get_data()
        self.assertEqual(data["mmr"], "3500")
        self.assertEqual(data["roles"], ["3"])
        self.assertEqual(await self.state.get_state(), GuestProfileWizard.roles.state)
        self.assertIn("3500", self.bot.views[-1][0])
        self.assertEqual(self.storage.get_choice(7, "pending_onboarding_action", 0), {"action": "looking"})
        self.api.public.assert_not_awaited()

    async def test_unranked_zero_survives_restart_and_creates_profile(self):
        await self.start()
        self.assertTrue(any(button.callback_data == "register:mmr:unranked" for button in self.buttons()))
        await choose_unranked_mmr(self.callback("register:mmr:unranked"), self.state, self.api, self.settings, self.storage)
        await self.select_role()
        await self.restart()
        await begin_registration(self.callback("register:resume"), self.state, self.api, self.settings, self.storage)
        await complete_registration(self.callback("register:complete"), self.state, self.api, self.settings, self.storage, self.wakeup)
        self.assertEqual(self.api.public.await_args.args[2], {"title": "player", "mmr": "0", "roles": ["3"], "server": "EU"})
        self.assertIsNone(registration_draft(self.storage, 7))

    async def test_start_without_restart_keeps_entered_mmr(self):
        await self.start()
        await self.enter_mmr("5100")
        await start_panel(self.message("/start"), self.bot, self.api, self.settings, self.storage, self.state)
        self.assertIsNone(await self.state.get_state())
        await begin_registration(self.callback("register:resume"), self.state, self.api, self.settings, self.storage)
        self.assertEqual((await self.state.get_data())["mmr"], "5100")
        self.assertEqual(await self.state.get_state(), GuestProfileWizard.roles.state)

    async def test_invalid_mmr_keeps_unranked_choice_and_mmr_step(self):
        await self.start()
        await self.enter_mmr("abc")
        self.assertEqual(await self.state.get_state(), GuestProfileWizard.mmr.state)
        self.assertTrue(any(button.callback_data == "register:mmr:unranked" for button in self.buttons()))
        self.assertNotIn("mmr", registration_draft(self.storage, 7))

    async def test_unranked_button_cannot_reset_mmr_after_advancing_to_roles(self):
        await self.start()
        await self.enter_mmr("6000")
        await choose_unranked_mmr(self.callback("register:mmr:unranked"), self.state, self.api, self.settings, self.storage)
        self.assertEqual((await self.state.get_data())["mmr"], "6000")

    async def test_cancel_discards_only_own_draft(self):
        await self.start()
        other = FSMContext(self.memory, StorageKey(bot_id=1, chat_id=8, user_id=8))
        await start_profile_registration(self.bot, other, self.api, self.settings, self.storage, 8, 8, telegram_name="other")
        await cancel_registration(self.callback("register:cancel"), self.state, self.api, self.settings, self.storage)
        self.assertIsNone(registration_draft(self.storage, 7))
        self.assertEqual(registration_draft(self.storage, 8)["display_name"], "other")

    async def test_mmr_step_and_invitation_survive_restart(self):
        await self.start(invite_code="m6QvueE", invite_role="4")
        await self.restart()
        await begin_registration(self.callback("register:resume"), self.state, self.api, self.settings, self.storage)
        self.assertEqual(await self.state.get_state(), GuestProfileWizard.mmr.state)
        self.assertEqual((await self.state.get_data())["party_invite_code"], "m6QvueE")
        await self.enter_mmr("4200")
        self.assertEqual((await self.state.get_data())["roles"], ["4"])

    async def test_completed_website_profile_is_not_recreated_from_old_draft(self):
        await self.start()
        await self.enter_mmr("3500")
        self.storage.save_session(7, "access", "refresh")
        self.profile = {"title": "Site profile", "mmr": "7000", "roles": ["1"]}
        await self.restart()
        await begin_registration(self.callback("register:resume"), self.state, self.api, self.settings, self.storage)
        self.api.public.assert_not_awaited()
        self.assertEqual(self.profile["mmr"], "7000")
        self.assertIsNone(registration_draft(self.storage, 7))

    async def test_failed_creation_keeps_progress(self):
        await self.start()
        await self.enter_mmr("2500")
        await self.select_role()
        self.api.public.side_effect = ApiError("Try later", 503)
        await complete_registration(self.callback("register:complete"), self.state, self.api, self.settings, self.storage, self.wakeup)
        self.assertEqual(registration_draft(self.storage, 7)["mmr"], "2500")
        self.assertEqual(registration_draft(self.storage, 7)["roles"], ["3"])

    async def test_link_failure_resumes_without_creating_second_account(self):
        await self.start()
        await self.enter_mmr("3000")
        await self.select_role()
        self.api.ensure_telegram_link.side_effect = ApiError("Try later", 503)
        await complete_registration(self.callback("register:complete"), self.state, self.api, self.settings, self.storage, self.wakeup)
        await self.restart()
        await start_panel(self.message("/start"), self.bot, self.api, self.settings, self.storage, self.state)
        self.assertTrue(any(button.callback_data == "register:resume" for button in self.buttons()))
        await begin_registration(self.callback("register:resume"), self.state, self.api, self.settings, self.storage)
        self.api.ensure_telegram_link.side_effect = None
        await retry_telegram_link(self.callback("register:retry-link"), self.state, self.api, self.settings, self.storage, self.wakeup)
        self.assertEqual(self.api.public.await_count, 1)
        self.assertIsNone(registration_draft(self.storage, 7))


if __name__ == "__main__":
    unittest.main()
