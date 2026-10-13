"""Tournament flows with real storage/FSM/UI and isolated API/Telegram transports."""

import asyncio
from copy import deepcopy
from datetime import datetime
from pathlib import Path
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch
from urllib.parse import parse_qs, urlparse
from uuid import UUID

from aiogram.exceptions import TelegramAPIError
from aiogram.fsm.context import FSMContext
from aiogram.fsm.storage.base import StorageKey
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.methods import SendMessage
from aiogram.types import User
from cryptography.fernet import Fernet

from bot.api.client import ApiError
from bot.handlers import tournaments
from bot.handlers.registration import (
    GuestProfileWizard, choose_unranked_mmr, complete_registration,
    toggle_registration_role,
)
from bot.services import tournament_participation as participation
from bot.storage.database import BotStorage


USER_ID = 7
EVENT = {
    "id": "12345678-1234-4234-8234-123456789abc",
    "slug": "zero-mmr-cup",
    "title": "Турнир <нулевого MMR>",
    "status": "REGISTRATION_OPEN",
    "startsAt": "2026-10-20T15:00:00Z",
}
ENTRY_ID = "87654321-4321-4321-8321-cba987654321"
OTHER_ENTRY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
SPONSOR_ID = "11111111-1111-4111-8111-111111111111"
API_ROOT = "/dota/tournaments/" + EVENT["slug"]


class IsolatedBot:
    def __init__(self):
        self.views = []
        self.sent_messages = []
        self.delete_message = AsyncMock()

    def view(self, chat_id, text, reply_markup, message_id=20):
        self.views.append((text, reply_markup))
        return SimpleNamespace(chat=SimpleNamespace(id=chat_id), message_id=message_id, photo=[])

    async def send_photo(self, chat_id, photo, caption=None, reply_markup=None, **kwargs):
        return self.view(chat_id, caption, reply_markup)

    async def send_message(self, chat_id, text, reply_markup=None, **kwargs):
        self.sent_messages.append((chat_id, text, reply_markup))
        return self.view(chat_id, text, reply_markup, 21)

    async def edit_message_media(self, media, chat_id, message_id, reply_markup=None, **kwargs):
        return self.view(chat_id, media.caption, reply_markup, message_id)

    async def edit_message_text(self, text, chat_id, message_id, reply_markup=None, **kwargs):
        return self.view(chat_id, text, reply_markup, message_id)

    async def edit_message_caption(self, caption, chat_id, message_id, reply_markup=None, **kwargs):
        return self.view(chat_id, caption, reply_markup, message_id)


class IsolatedApi:
    """Reject unknown paths, including any ordinary matchmaking mutation."""

    def __init__(self):
        self.profile = {"title": "zero", "mmr": 0, "roles": ["3", "5"]}
        self.state = "NONE"
        self.sponsor_required = False
        self.ticket_number = 0
        self.parties = [
            {"slug": "owned", "name": "Owned", "kind": "TEAM", "isOwner": True},
            {"slug": "someone-else", "name": "Other", "kind": "TEAM", "isOwner": False},
            {"slug": "ordinary-party", "name": "Party", "kind": "PARTY", "isOwner": True},
        ]
        self.entry = {
            "id": ENTRY_ID, "name": "Squad", "status": "RECRUITING", "joinMode": "OPEN", "ownRole": "3",
            "members": [{"name": "zero", "role": "3", "mmr": 0}],
        }
        self.request = {"entryId": ENTRY_ID, "entryName": "Squad <one>", "role": "3"}
        self.suggestions = [{"entryId": ENTRY_ID, "name": "Squad", "role": "3", "memberCount": 2, "averageMmr": 0}]
        self.public = AsyncMock(side_effect=self.request_public)
        self.user = AsyncMock(side_effect=self.request_user)
        self.ensure_telegram_link = AsyncMock()
        self.record_telegram_bot_started = AsyncMock()
        self.login_telegram_bot_session = AsyncMock(side_effect=ApiError("Not linked", 401))
        self.create_web_access_ticket = AsyncMock(side_effect=self.new_ticket)

    def result(self):
        result = {
            "tournament": EVENT, "state": self.state, "roles": (self.profile or {}).get("roles", []),
            "sponsorRequired": self.sponsor_required,
            "sponsors": [{"id": SPONSOR_ID, "name": "Sponsor", "url": "https://sponsor.example"}],
            "suggestions": self.suggestions,
        }
        if self.state == "WAITING":
            result["queueRoles"] = result["roles"]
        elif self.state == "REQUESTED":
            result["request"] = self.request
        elif self.state == "JOINED":
            result["entry"] = self.entry
        return deepcopy(result)

    async def new_ticket(self, user_id):
        self.ticket_number += 1
        return "fresh-ticket-" + str(self.ticket_number)

    async def request_public(self, method, path, body=None):
        if method == "POST" and path == "/dota/profiles/guest":
            self.profile = deepcopy(body)
            return {"accessToken": "access", "refreshToken": "refresh", "recoveryUrl": "https://site.example/recovery"}
        if method == "GET" and path == "/dota/tournaments":
            return [deepcopy(EVENT)]
        if method == "GET" and path == API_ROOT:
            return deepcopy(EVENT)
        if method == "GET" and path == "/dota/tournaments/entry-links/" + ENTRY_ID:
            return {"slug": EVENT["slug"], "tournamentId": EVENT["id"], "entryId": ENTRY_ID,
                    "teamName": "Invited squad", "tournamentTitle": EVENT["title"]}
        raise AssertionError(f"Unexpected public API call: {method} {path}")

    async def request_user(self, user_id, method, path, body=None):
        if method == "GET" and path == "/dota/profiles/me":
            if self.profile is None:
                raise ApiError("No profile", 404)
            return deepcopy(self.profile)
        if method == "POST" and path == "/dota/profiles":
            self.profile = deepcopy(body)
            return deepcopy(body)
        if method == "GET" and path == "/social/parties/me":
            return {"team": deepcopy(self.parties[0]), "parties": deepcopy(self.parties[1:]), "invites": []}
        if method == "GET" and path == API_ROOT + "/participation":
            return self.result()
        if method == "GET" and path.startswith(API_ROOT + "/participation/teams?page="):
            return {"items": deepcopy(self.suggestions[:4]), "page": 0, "pageCount": 1, "total": len(self.suggestions)}
        if method == "GET" and path == API_ROOT:
            return {**deepcopy(EVENT), "entries": [
                {"id": OTHER_ENTRY_ID, "teamName": "Unrelated squad", "status": "RECRUITING", "joinMode": "OPEN", "members": []},
                {"id": ENTRY_ID, "teamName": "Invited squad", "status": "RECRUITING", "joinMode": "OPEN",
                 "members": [{"positionRole": "2"}]},
            ]}
        if method == "POST" and path == API_ROOT + "/participation/cancel":
            self.state = "NONE"
            return self.result()
        if method == "POST" and path in {
            API_ROOT + "/participation/solo", API_ROOT + "/squads", API_ROOT + "/entries",
            API_ROOT + "/entries/" + ENTRY_ID + "/join",
        }:
            if self.sponsor_required:
                raise AssertionError("Bot attempted a tournament mutation before the sponsor gate completed")
            if path.endswith("/participation/solo"):
                self.state = "WAITING"
                return self.result()
            self.state = "JOINED"
            self.entry["ownRole"] = (body or {}).get("positionRole", "3")
            return {"result": "JOINED", "entryId": ENTRY_ID, "tournament": deepcopy(EVENT)}
        raise AssertionError(f"Unexpected user API call: {method} {path}")


class TournamentTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.database_path = str(Path(self.folder.name) / "tournaments.db")
        self.key = Fernet.generate_key()
        self.storage = BotStorage(self.database_path, self.key)
        self.storage.initialize()
        self.storage.save_session(USER_ID, "access", "refresh")
        self.memory = MemoryStorage()
        self.state = FSMContext(self.memory, StorageKey(bot_id=1, chat_id=USER_ID, user_id=USER_ID))
        self.bot = IsolatedBot()
        self.api = IsolatedApi()
        self.settings = SimpleNamespace(site_url="https://site.example", main_bot_username="FDPdotabot", room_worker_only=False)
        self.wakeup = asyncio.Event()
        self.context = participation.save_tournament_context(self.storage, USER_ID, EVENT)

    async def asyncTearDown(self):
        await asyncio.sleep(0)
        await self.memory.close()
        self.storage.close()
        self.folder.cleanup()

    def message(self, text="", username="zero", user_id=USER_ID):
        return SimpleNamespace(text=text, bot=self.bot, delete=AsyncMock(), message_id=20,
            chat=SimpleNamespace(type="private", id=user_id),
            from_user=User(id=user_id, is_bot=False, first_name="Zero", last_name="Player", username=username))

    def callback(self, data, username="zero", user_id=USER_ID):
        message = self.message(username=username, user_id=user_id)
        return SimpleNamespace(data=data, bot=self.bot, from_user=message.from_user, message=message, answer=AsyncMock())

    async def action(self, name, token=None):
        await tournaments.tournament_action(
            self.callback(participation.tournament_callback(name, token or self.context["eventHex"])),
            self.state, self.api, self.settings, self.storage,
        )

    def buttons(self):
        return [button for row in self.bot.views[-1][1].inline_keyboard for button in row]

    def callback_for(self, prefix, text=None):
        return next(button.callback_data for button in self.buttons()
                    if button.callback_data and button.callback_data.startswith(prefix) and (text is None or text in button.text))

    async def press(self, data):
        await tournaments.tournament_action(self.callback(data), self.state, self.api, self.settings, self.storage)

    async def restart(self):
        await self.memory.close()
        self.storage.close()
        self.storage = BotStorage(self.database_path, self.key)
        self.storage.initialize()
        self.memory = MemoryStorage()
        self.state = FSMContext(self.memory, StorageKey(bot_id=1, chat_id=USER_ID, user_id=USER_ID))

    def save_state(self, state, user_id=USER_ID):
        self.api.state = state
        self.storage.save_session(user_id, "access", "refresh")
        context = participation.save_tournament_context(self.storage, user_id, EVENT)
        return participation.remember_participation(self.storage, user_id, context, self.api.result())

    async def poll(self, context=None, bot=None, user_id=USER_ID):
        await participation.poll_tournament_participation(bot or self.bot, self.api, self.settings, self.storage,
                                                        user_id, context or self.context)

    def notice(self, event):
        return {"id": "notice-" + event, "telegramUserId": str(USER_ID), "payload": {
            "type": "tournament_participation", "event": event, "tournamentId": EVENT["id"],
            "tournamentSlug": EVENT["slug"], "tournamentTitle": EVENT["title"],
            "entryId": ENTRY_ID, "entryName": "Squad <one>",
        }}

    async def deliver(self, event, bot=None):
        return await participation.deliver_tournament_participation_notice(
            bot or self.bot, self.api, self.settings, self.storage, self.notice(event))

    async def test_public_list_and_private_callback_record_start_once(self):
        callback = self.callback("tournaments:list")
        await tournaments.list_tournaments(callback, self.api, self.settings, self.storage)
        self.api.public.assert_awaited_once_with("GET", "/dota/tournaments")
        self.api.record_telegram_bot_started.assert_awaited_once_with(USER_ID)
        await self.press(self.callback_for("tr:open:"))
        self.api.record_telegram_bot_started.assert_awaited_once()
        self.assertTrue(any(button.text == "🎮 Участвовать" for button in self.buttons()))

    async def test_bot_start_record_failure_does_not_block_tournaments(self):
        self.api.record_telegram_bot_started.side_effect = ApiError("Temporary outage", 503)
        await tournaments.list_tournaments(self.callback("tournaments:list"), self.api, self.settings, self.storage)
        self.assertIn("Турниры Dota 2", self.bot.views[-1][0])
        self.assertIsNone(self.storage.get_choice(USER_ID, "tournament_bot_started", 0))
        self.api.record_telegram_bot_started.side_effect = None
        await self.action("solo")
        self.assertEqual(self.api.record_telegram_bot_started.await_count, 2)

    async def test_callback_rejects_wrong_private_chat_and_unknown_context(self):
        callback = self.callback(participation.tournament_callback("queue", self.context["eventHex"]))
        callback.message.chat.id = USER_ID + 1
        await tournaments.tournament_action(callback, self.state, self.api, self.settings, self.storage)
        callback.answer.assert_awaited_once()
        self.assertTrue(callback.answer.await_args.kwargs["show_alert"])
        self.api.user.assert_not_awaited()
        self.api.record_telegram_bot_started.assert_not_awaited()
        callback = self.callback(participation.tournament_callback("queue", UUID(OTHER_ENTRY_ID).hex))
        await tournaments.tournament_action(callback, self.state, self.api, self.settings, self.storage)
        self.api.user.assert_not_awaited()
        self.assertTrue(callback.answer.await_args.kwargs["show_alert"])

    async def test_existing_zero_mmr_profile_gets_suggestions_without_signup(self):
        await self.action("solo")
        self.assertEqual(self.api.profile["mmr"], 0)
        self.assertIn("Автоподбор выключен", self.bot.views[-1][0])
        self.assertTrue(any(button.text == "⚙️ Настройки поиска" for button in self.buttons()))
        self.assertTrue(any(button.text == "👥 Выбрать команду" for button in self.buttons()))
        self.api.public.assert_not_awaited()
        self.api.login_telegram_bot_session.assert_not_awaited()
        self.assertIsNone(await self.state.get_state())
        self.api.user.assert_any_await(USER_ID, "POST", API_ROOT + "/participation/solo", {"mode": "BOARD"})

    async def test_create_own_team_button_pauses_search_and_shows_underlined_instruction(self):
        await self.action("solo")
        self.assertTrue(any(button.text == "➕ Создать команду" for button in self.buttons()))
        await self.press(self.callback_for("tr:newteam:"))
        self.api.user.assert_any_await(USER_ID, "POST", API_ROOT + "/participation/cancel", {})
        self.assertFalse(any(call.args[2] == "/social/parties/me" for call in self.api.user.await_args_list))
        self.assertIn("<u>Если вы с друзьями то один создает команду и приглашает остальных</u>", self.bot.views[-1][0])
        await self.press(participation.tournament_callback("role", self.context["eventHex"], "1"))
        self.assertIn("Ваша позиция: <b>Керри</b>.", self.bot.views[-1][0])
        await self.press(self.callback_for("tr:create:"))
        self.api.user.assert_any_await(USER_ID, "POST", API_ROOT + "/squads", {"positionRole": "1", "joinMode": "OPEN"})

    async def test_lost_local_session_recovers_existing_profile(self):
        self.storage.unlink(USER_ID)
        self.api.login_telegram_bot_session.side_effect = None
        self.api.login_telegram_bot_session.return_value = {"accessToken": "recovered", "refreshToken": "refresh"}
        await self.action("solo")
        self.assertEqual(self.storage.get_session(USER_ID).access_token, "recovered")
        self.api.public.assert_not_awaited()
        self.assertIsNone(await self.state.get_state())

    async def test_guest_signup_survives_restart_and_bypasses_ordinary_search(self):
        self.storage.unlink(USER_ID)
        self.api.profile = None
        self.storage.set_choices(USER_ID, "pending_onboarding_action", [{"action": "looking"}])
        await self.action("solo")
        self.assertEqual(await self.state.get_state(), GuestProfileWizard.mmr.state)
        self.assertEqual((await self.state.get_data())["display_name"], "zero")
        await choose_unranked_mmr(self.callback("register:mmr:unranked"), self.state, self.api, self.settings, self.storage)
        await toggle_registration_role(self.callback("register:toggle:3"), self.state, self.storage, self.api, self.settings)
        await self.restart()
        self.assertTrue(await tournaments.resume_pending_tournament(
            self.bot, self.state, self.api, self.settings, self.storage, USER_ID, USER_ID, self.wakeup))
        self.assertEqual(await self.state.get_state(), GuestProfileWizard.roles.state)
        self.assertEqual((await self.state.get_data())["mmr"], "0")
        with patch("bot.handlers.search.resume_pending_onboarding_action", new_callable=AsyncMock) as ordinary:
            await complete_registration(self.callback("register:complete"), self.state, self.api,
                                        self.settings, self.storage, self.wakeup)
            ordinary.assert_not_awaited()
        self.assertEqual(self.api.profile["mmr"], "0")
        self.assertEqual(self.api.profile["roles"], ["3"])
        self.assertIn("Ищем команду для турнира", self.bot.views[-1][0])
        self.assertFalse(self.wakeup.is_set())
        self.assertIsNone(self.storage.get_choice(USER_ID, participation.PENDING_KEY, 0))
        self.assertIsNone(self.storage.get_choice(USER_ID, "pending_onboarding_action", 0))

    async def test_tournament_selection_strips_old_party_constraints_preserving_progress(self):
        self.storage.unlink(USER_ID)
        self.api.profile = None
        self.storage.set_choices(USER_ID, "pending_party_invite", [{"code": "old-party", "role": "2"}])
        self.storage.set_choices(USER_ID, "pending_solo_search", [{"roles": ["2"]}])
        self.storage.set_choices(USER_ID, "registration_draft", [{
            "step": "roles", "display_name": "Entered name", "mmr": "0", "roles": ["3", "5"],
            "dota_account_id": "12345", "party_invite_code": "old-party", "party_invite_role": "2",
            "required_role": "2", "pending_action": "looking",
        }])
        await self.action("friends")
        data = await self.state.get_data()
        self.assertEqual((data["display_name"], data["mmr"], data["roles"], data["dota_account_id"]),
                         ("Entered name", "0", ["3", "5"], "12345"))
        for field in ("party_invite_code", "party_invite_role", "required_role", "pending_action"):
            self.assertNotIn(field, data)
        for kind in ("pending_party_invite", "pending_solo_search", "pending_onboarding_action"):
            self.assertIsNone(self.storage.get_choice(USER_ID, kind, 0))

    async def test_exact_entry_invitation_survives_profile_registration_and_restart(self):
        self.storage.unlink(USER_ID)
        self.api.profile = None
        await tournaments.start_tournament_entry_invitation(
            self.message("/start te_" + UUID(ENTRY_ID).hex, username=None), self.state, self.api, self.settings, self.storage)
        self.api.public.assert_awaited_once_with("GET", "/dota/tournaments/entry-links/" + ENTRY_ID)
        await tournaments.tournament_action(
            self.callback(self.callback_for("tr:invite:"), username=None),
            self.state, self.api, self.settings, self.storage)
        self.assertEqual(await self.state.get_state(), GuestProfileWizard.mmr.state)
        self.assertEqual((await self.state.get_data())["display_name"], "Zero Player")
        self.assertEqual(self.storage.get_choice(USER_ID, participation.PENDING_KEY, 0)["entryId"], ENTRY_ID)
        await self.restart()
        self.storage.save_session(USER_ID, "access", "refresh")
        self.api.profile = {"title": "Zero Player", "mmr": 0, "roles": ["3", "5"]}
        self.assertTrue(await tournaments.resume_pending_tournament(
            self.bot, self.state, self.api, self.settings, self.storage, USER_ID, USER_ID))
        role_buttons = [button for button in self.buttons() if button.callback_data and button.callback_data.startswith("tr:join:")]
        self.assertEqual(len(role_buttons), 4)
        self.assertFalse(any("Мид" in button.text for button in role_buttons))
        await self.press(self.callback_for("tr:join:", "Оффлейн"))
        self.api.user.assert_any_await(USER_ID, "POST", API_ROOT + "/entries/" + ENTRY_ID + "/join", {"positionRole": "3", "viaInvitation": True})
        self.assertFalse(any(OTHER_ENTRY_ID in str(call) and call.args[1] == "POST" for call in self.api.user.await_args_list))
        self.assertIn("0 MMR", self.bot.views[-1][0])

    async def test_friends_create_generated_open_roster_and_plain_invitation(self):
        await self.action("friends")
        self.assertIn("Оффлейн", self.bot.views[-1][0])
        self.assertEqual(sum(bool(button.callback_data and button.callback_data.startswith("tr:team:")) for button in self.buttons()), 1)
        await self.action("create")
        self.api.user.assert_any_await(USER_ID, "POST", API_ROOT + "/squads", {"positionRole": "3", "joinMode": "OPEN"})
        self.assertIn("1/5", self.bot.views[-1][0])
        invitation = next(button.copy_text.text for button in self.buttons() if button.copy_text)
        self.assertEqual(invitation, "https://t.me/FDPdotabot?start=te_" + UUID(ENTRY_ID).hex)

    async def test_only_owned_persistent_team_is_offered_and_registered(self):
        await self.action("friends")
        await self.press(self.callback_for("tr:team:"))
        self.api.user.assert_any_await(USER_ID, "POST", API_ROOT + "/entries", {"teamSlug": "owned", "joinMode": "OPEN"})

    async def test_site_team_openings_issue_fresh_authenticated_tickets(self):
        self.save_state("JOINED")
        urls = []
        for _ in range(2):
            await self.action("web")
            urls.append(next(button.url for button in self.buttons() if button.url))
        self.assertNotEqual(urls[0], urls[1])
        self.assertEqual(self.api.create_web_access_ticket.await_count, 2)
        for number, url in enumerate(urls, 1):
            query = parse_qs(urlparse(url).query)
            self.assertEqual(query["ticket"], [f"fresh-ticket-{number}"])
            self.assertEqual(query["next"], [f"/games/tournaments/{EVENT['slug']}/teams/{ENTRY_ID}#tournament-team-chat"])

    async def test_sponsor_gate_is_authoritative_and_resumes_saved_queue(self):
        self.api.sponsor_required = True
        await self.action("queue")
        await self.press(self.callback_for("tr:sponsor:"))
        url = next(button.url for button in self.buttons() if button.url)
        self.assertEqual(parse_qs(urlparse(url).query)["next"], [f"/games/tournaments/{EVENT['slug']}?supporter={SPONSOR_ID}"])
        await self.action("continue")
        self.assertFalse(any(call.args[1] == "POST" for call in self.api.user.await_args_list))
        self.assertEqual(self.storage.get_choice(USER_ID, participation.PENDING_KEY, 0)["action"], "queue")
        self.api.sponsor_required = False
        await self.restart()
        self.assertTrue(await tournaments.resume_pending_tournament(
            self.bot, self.state, self.api, self.settings, self.storage, USER_ID, USER_ID))
        self.api.user.assert_any_await(USER_ID, "POST", API_ROOT + "/participation/solo", {"mode": "AUTO", "roles": ["3", "5"]})
        self.assertIn("Ищем команду", self.bot.views[-1][0])
        self.assertFalse(any("/sponsors/" in call.args[2] for call in self.api.user.await_args_list))

    async def test_all_rendered_callbacks_fit_telegram_limit(self):
        await tournaments.list_tournaments(self.callback("tournaments:list"), self.api, self.settings, self.storage)
        await self.action("signup")
        await self.action("solo")
        await self.action("friends")
        self.api.sponsor_required = True
        await self.action("queue")
        for _, markup in self.bot.views:
            if markup is None:
                continue
            for row in markup.inline_keyboard:
                for button in row:
                    if button.callback_data:
                        self.assertLessEqual(len(button.callback_data.encode("utf-8")), 64)
        with self.assertRaises(ValueError):
            participation.tournament_callback("a" * 40, self.context["eventHex"])

    async def test_status_cards_distinguish_waiting_request_registered_and_reserve(self):
        for state, phrase in (("WAITING", "Ищем команду"), ("REQUESTED", "Активные заявки: 1")):
            self.api.state = state
            self.assertIn(phrase, participation.tournament_status_text(self.api.result()))
        self.api.state = "JOINED"
        for status, phrase in (("RECRUITING", "Собираем состав · 1/5"), ("REGISTERED", "зарегистрирована"), ("RESERVE", "в резерве · 1/5")):
            self.api.entry["status"] = status
            text = participation.tournament_status_text(self.api.result())
            self.assertIn(phrase, text)
            self.assertIn("0 MMR", text)

    async def test_joined_team_displays_safe_clickable_telegram_tags_and_chat_button(self):
        self.api.state = "JOINED"
        self.api.entry["members"] = [{"name": "<Player>", "role": "2", "mmr": 0, "telegramUsername": "Player_QA"},
                                    {"name": "Other", "role": "3", "mmr": 1200, "telegramUsername": 'bad<tag>'}]
        text = participation.tournament_status_text(self.api.result())
        self.assertIn('href="https://t.me/Player_QA">@Player_QA</a>', text)
        self.assertIn("&lt;Player&gt;", text)
        self.assertIn("Telegram-ник не указан", text)
        self.assertNotIn("bad<tag>", text)
        buttons = [button for row in participation.tournament_status_keyboard(self.api.result(), self.context, self.settings).inline_keyboard for button in row]
        self.assertEqual(buttons[0].text, "💬 Открыть чат команды")

    async def test_worker_and_outbox_do_not_double_send_and_delivery_is_durable(self):
        context = self.save_state("WAITING")
        self.api.state = "JOINED"
        await self.poll(context)
        self.assertEqual(len(self.bot.sent_messages), 0)
        self.assertTrue(await self.deliver("found"))
        self.assertEqual(len(self.bot.sent_messages), 1)
        self.assertIn("Команда найдена", self.bot.sent_messages[0][1])
        await self.restart()
        participation.save_tournament_context(self.storage, USER_ID, EVENT, state="WAITING", waitToken=context["waitToken"])
        await self.poll(context)
        self.assertTrue(await self.deliver("found"))
        self.assertEqual(len(self.bot.sent_messages), 1)
        self.api.entry["status"] = "REGISTERED"
        self.api.entry["members"] = [{"name": f"Player {role}", "role": role, "mmr": 0} for role in participation.ROLE_NAMES]
        await self.poll(context)
        self.assertEqual(len(self.bot.sent_messages), 1)
        self.assertTrue(await self.deliver("registered"))
        self.assertEqual(len(self.bot.sent_messages), 2)
        self.assertIn("Состав собран", self.bot.sent_messages[-1][1])
        participation.save_tournament_context(self.storage, USER_ID, EVENT, entryStatus="RECRUITING", nextPollAt=0)
        await self.poll(context)
        self.assertTrue(await self.deliver("registered"))
        self.assertEqual(len(self.bot.sent_messages), 2)

    async def test_outbox_request_approval_and_decline_use_distinct_notices(self):
        context = self.save_state("REQUESTED")
        self.api.state = "JOINED"
        await self.poll(context)
        self.assertEqual(len(self.bot.sent_messages), 0)
        self.assertTrue(await self.deliver("accepted"))
        self.assertIn("Вашу заявку приняли", self.bot.sent_messages[-1][1])
        self.assertNotIn("Команда найдена", self.bot.sent_messages[-1][1])
        self.assertTrue(self.storage.is_temporary_message(USER_ID, 21))
        delete_at = self.storage._connection().execute("SELECT delete_at FROM temporary_messages WHERE chat_id=? AND message_id=?", (USER_ID, 21)).fetchone()[0]
        self.assertAlmostEqual(datetime.fromisoformat(delete_at).timestamp() - time.time(), 120, delta=3)
        context = self.save_state("REQUESTED")
        self.api.state = "NONE"
        await self.poll(context)
        self.assertEqual(len(self.bot.sent_messages), 1)
        self.assertTrue(await self.deliver("request-closed"))
        notice = self.bot.sent_messages[-1][1]
        self.assertIn("Заявка в команду закрыта", notice)
        self.assertIn("Squad &lt;one&gt;", notice)
        self.assertNotIn("Команда найдена", notice)
        self.assertIsNone(next((item for item in participation.monitored_tournament_contexts(self.storage)
                               if item[0] == USER_ID), None))

    async def test_accepted_notice_is_deleted_after_opening_team_and_timer_is_removed(self):
        self.save_state("JOINED")
        self.assertTrue(await self.deliver("accepted"))
        callback = self.callback(participation.tournament_callback("web", self.context["eventHex"]))
        callback.message.message_id = 21
        await tournaments.tournament_action(callback, self.state, self.api, self.settings, self.storage)
        self.bot.delete_message.assert_any_await(USER_ID, 21)
        self.assertFalse(self.storage.is_temporary_message(USER_ID, 21))
        self.assertTrue(any(button.url for button in self.buttons()))

    async def test_team_card_contains_description_players_and_position_actions(self):
        result = {**self.api.result(), "requests": []}
        entry = {"id": ENTRY_ID, "teamName": "Invalides", "description": "<Наш стак>", "status": "RECRUITING", "joinMode": "CONFIRM",
                 "members": [{"displayName": "<Alice>", "positionRole": "3", "mmr": 1200, "dotaProfileSlug": "alice"}]}
        self.api.user.return_value = {**EVENT, "entries": [entry]}
        self.api.user.side_effect = None
        await tournaments._show_invite_roles(self.bot, self.api, self.settings, self.storage, USER_ID, USER_ID,
            self.context, {"entryId": ENTRY_ID}, result)
        caption = self.bot.views[-1][0]
        self.assertIn("Команда: Invalides", caption)
        self.assertIn("&lt;Наш стак&gt;", caption)
        self.assertIn("&lt;Alice&gt;", caption)
        self.assertIn("1200 MMR", caption)
        self.assertIn("/dota/alice", caption)
        joins = [button for button in self.buttons() if (button.callback_data or "").startswith("tr:join:")]
        self.assertEqual(len(joins), 4)
        self.assertTrue(all(button.text.startswith("Подать заявку · ") for button in joins))
        self.assertFalse(any("Оффлейн" in button.text for button in joins))

    async def test_pending_applications_do_not_block_opening_other_team_card(self):
        self.api.state = "REQUESTED"
        self.api.suggestions[0]["entryId"] = OTHER_ENTRY_ID
        await self.action("solo")
        self.assertTrue(any(button.text == "👥 Выбрать команду" for button in self.buttons()))
        self.assertFalse(any(button.text == "Включить автоподбор" for button in self.buttons()))
        self.assertFalse(any(call.args[1] == "POST" for call in self.api.user.await_args_list))
        await self.action("teams")
        await self.press(self.callback_for("tr:pickteam:"))
        self.assertIn("Игроки", self.bot.views[-1][0])
        self.assertTrue(any((button.callback_data or "").startswith("tr:join:") for button in self.buttons()))

    async def test_request_withdrawal_and_cancel_race_do_not_emit_decline(self):
        self.save_state("REQUESTED")
        await self.action("cancel")
        self.api.user.assert_any_await(USER_ID, "POST", API_ROOT + "/participation/cancel", {})
        context = self.save_state("REQUESTED")

        async def cancelled_during_poll(user_id, method, path, body=None):
            participation.save_tournament_context(self.storage, USER_ID, EVENT, state="NONE")
            self.api.state = "JOINED"
            return self.api.result()

        self.api.user.side_effect = cancelled_during_poll
        count = len(self.bot.sent_messages)
        await self.poll(context)
        self.assertEqual(len(self.bot.sent_messages), count)

    async def test_outbox_transport_retry_does_not_lose_or_duplicate_notice(self):
        self.save_state("REQUESTED")
        self.api.state = "JOINED"
        transport = SimpleNamespace(send_message=AsyncMock(side_effect=[
            TelegramAPIError(SendMessage(chat_id=USER_ID, text="test"), "Temporary failure"), SimpleNamespace(message_id=21),
        ]))
        self.assertFalse(await self.deliver("accepted", transport))
        self.assertFalse(self.storage.has_delivered_notification("notice-accepted"))
        self.assertTrue(await self.deliver("accepted", transport))
        self.assertEqual(transport.send_message.await_count, 2)
        self.assertTrue(await self.deliver("accepted", transport))
        self.assertEqual(transport.send_message.await_count, 2)
        self.assertEqual(participation.load_tournament_context(self.storage, USER_ID, self.context["eventHex"])["state"], "JOINED")

    async def test_outbox_site_user_without_saved_tournament_context_gets_current_composition(self):
        self.storage.set_choices(USER_ID, participation.CONTEXT_PREFIX + self.context["eventHex"], [])
        self.storage.unlink(USER_ID)
        self.api.login_telegram_bot_session.side_effect = None
        self.api.login_telegram_bot_session.return_value = {"accessToken": "recovered", "refreshToken": "refresh"}
        self.api.state = "JOINED"
        self.assertTrue(await self.deliver("found"))
        self.api.login_telegram_bot_session.assert_awaited_once_with(USER_ID)
        self.assertEqual(self.storage.get_session(USER_ID).access_token, "recovered")
        self.assertIn("0 MMR", self.bot.sent_messages[-1][1])
        self.assertIn("1/5", self.bot.sent_messages[-1][1])
        self.assertEqual(self.bot.sent_messages[-1][2].inline_keyboard[0][0].callback_data,
                         participation.tournament_callback("web", self.context["eventHex"]))
        self.assertEqual(participation.load_tournament_context(self.storage, USER_ID, self.context["eventHex"])["entryId"], ENTRY_ID)

    async def test_outbox_suppresses_stale_entry_closed_event_and_premature_registration(self):
        self.api.state = "JOINED"
        stale = self.notice("found")
        stale["payload"]["entryId"] = OTHER_ENTRY_ID
        self.assertTrue(await participation.deliver_tournament_participation_notice(
            self.bot, self.api, self.settings, self.storage, stale))
        self.assertTrue(await self.deliver("registered"))
        self.api.state = "CLOSED"
        self.assertTrue(await self.deliver("found"))
        self.assertEqual(len(self.bot.sent_messages), 0)

    async def test_closed_request_notice_is_ignored_after_joining_queue_or_other_request(self):
        for state in ("WAITING", "REQUESTED", "JOINED", "CLOSED"):
            self.api.state = state
            self.assertTrue(await self.deliver("request-closed"))
        self.assertEqual(len(self.bot.sent_messages), 0)

    async def test_outbox_api_outage_returns_retryable_failure(self):
        self.api.user.side_effect = ApiError("Temporary outage", 503)
        self.assertFalse(await self.deliver("found"))
        self.assertFalse(self.storage.has_delivered_notification("notice-found"))
        self.assertEqual(len(self.bot.sent_messages), 0)

    async def test_worker_closed_notice_and_unrelated_event_rejection(self):
        context = self.save_state("WAITING")
        self.api.state = "CLOSED"
        await self.poll(context)
        self.assertIn("завершены", self.bot.sent_messages[-1][1])
        context = self.save_state("WAITING")
        result = self.api.result()
        result["tournament"]["id"] = OTHER_ENTRY_ID
        self.api.user.side_effect = None
        self.api.user.return_value = result
        count = len(self.bot.sent_messages)
        with self.assertRaises(ApiError):
            await self.poll(context)
        self.assertEqual(len(self.bot.sent_messages), count)

    async def test_worker_bounds_concurrency_batch_and_roster_schedule(self):
        active = 0
        peak = 0
        original_sleep = asyncio.sleep
        self.api.state = "REQUESTED"
        for user_id in range(20, 48):
            self.save_state("REQUESTED", user_id)

        async def bounded_request(user_id, method, path, body=None):
            nonlocal active, peak
            active += 1
            peak = max(peak, active)
            try:
                await original_sleep(0)
                return self.api.result()
            finally:
                active -= 1

        self.api.user.side_effect = bounded_request
        with patch.object(participation.asyncio, "sleep", new=AsyncMock(side_effect=asyncio.CancelledError)):
            with self.assertRaises(asyncio.CancelledError):
                await participation.tournament_participation_worker(self.bot, self.api, self.settings, self.storage)
        self.assertEqual(self.api.user.await_count, participation.POLL_BATCH_SIZE)
        self.assertEqual(peak, participation.POLL_CONCURRENCY)
        self.api.user.side_effect = self.api.request_user
        context = self.save_state("JOINED")
        await self.poll(context)
        saved = participation.load_tournament_context(self.storage, USER_ID, context["eventHex"])
        self.assertGreaterEqual(saved["nextPollAt"] - saved["lastPollAt"], participation.ROSTER_POLL_SECONDS - 1)
        self.assertFalse(any(user_id == USER_ID for user_id, _ in participation.monitored_tournament_contexts(self.storage)))
        await participation.tournament_participation_worker(self.bot, self.api, SimpleNamespace(room_worker_only=True), self.storage)


if __name__ == "__main__":
    unittest.main()
