import unittest
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch
from uuid import uuid4

from aiogram.fsm.context import FSMContext
from aiogram.fsm.storage.base import StorageKey
from aiogram.fsm.storage.memory import MemoryStorage

from bot.api.client import ApiError
from bot.handlers.party_rooms import group_ping_menu, group_ping_player, group_ready, open_party_dota_id
from bot.handlers.registration import DotaIdOnlyWizard, start_standalone_dota_id
from bot.services.party_rooms import PartyRooms


class RoomControlFixture:
    def setUp(self):
        self.user_id = 11
        self.chat_id = -10012345678
        self.party_id, self.room_id, self.target = str(uuid4()), str(uuid4()), str(uuid4())
        self.choices = {}
        self.storage = SimpleNamespace(
            saved_party_rooms=lambda bot_id: [],
            get_choice=lambda user, key, index: (self.choices.get((user, key), []) + [None] * 5)[index],
            set_choices=lambda user, key, values: self.choices.__setitem__((user, key), values),
            track_party_notice=Mock(), add_temporary_message=Mock(),
            get_session=lambda user: object(),
            record_bot_user=Mock(), record_party_notification=Mock(),
            save_session=Mock(),
        )
        self.settings = SimpleNamespace(party_rooms_enabled=True, main_bot_username="FDPdotabot")
        self.bot = SimpleNamespace(id=12345, send_message=AsyncMock(return_value=SimpleNamespace(message_id=88)),
                                   edit_message_text=AsyncMock(), edit_message_reply_markup=AsyncMock())
        self.room = {"id": self.room_id, "partyId": self.party_id, "chatId": str(self.chat_id), "state": "ACTIVE", "generation": 4,
                     "data": {"partyName": "Test", "partySlug": "test", "expiresAt": (datetime.now(UTC) + timedelta(hours=1)).isoformat(),
                              "roster": [{"telegramId": str(self.user_id), "membershipId": "own"}]}}
        self.pool = PartyRooms(self.bot, object(), self.settings, self.storage)
        self.pool.by_chat[self.chat_id] = self.room
        self.pool.request = AsyncMock(return_value={"targets": [{"membershipId": self.target, "name": "Bob", "inChat": False}]})
        self.pool.mutate = AsyncMock(return_value=SimpleNamespace(message_id=77))
        self.pool.refresh_private_controls = AsyncMock()
        self.api = SimpleNamespace(party_rooms=self.pool, user=AsyncMock(), login_telegram_bot_session=AsyncMock(return_value={"accessToken": "qa", "refreshToken": "qa"}))
        self.pool.api = self.api

    def callback(self, data, user=None, chat=None):
        return SimpleNamespace(data=data, id="callback", from_user=SimpleNamespace(id=user or self.user_id), answer=AsyncMock(),
            message=SimpleNamespace(chat=SimpleNamespace(type="supergroup", id=chat or self.chat_id),
                                    model_dump=lambda: {"ephemeral_message_id": 123}))

    async def menu(self):
        callback = self.callback(f"roomping:{self.room_id}:4")
        with patch("bot.handlers.party_rooms.acknowledge_callback"):
            await group_ping_menu(callback, self.api, self.settings, self.storage)
        return callback


class RoomControlTests(RoomControlFixture, unittest.IsolatedAsyncioTestCase):
    async def test_ping_menu_is_private_bounded_and_bound_to_sender(self):
        await self.menu()
        method = self.pool.mutate.await_args.args[0]
        self.assertEqual(method.ephemeral_message_parameters["receiver_user_id"], self.user_id)
        self.assertEqual(method.ephemeral_message_parameters["callback_query_id"], "callback")
        token = method.reply_markup.inline_keyboard[0][0].callback_data
        self.assertLessEqual(len(token.encode()), 64)
        await group_ping_player(self.callback(token), self.api, self.settings, self.storage)
        self.pool.request.assert_any_await("POST", f"/{self.room_id}/ping", {
            "userId": str(self.user_id), "generation": 4, "targetMembershipId": self.target})

    async def test_other_user_or_chat_cannot_reuse_selection(self):
        await self.menu()
        token = self.pool.mutate.await_args.args[0].reply_markup.inline_keyboard[0][0].callback_data
        self.pool.request.reset_mock()
        await group_ping_player(self.callback(token, user=22), self.api, self.settings, self.storage)
        await group_ping_player(self.callback(token, chat=-100999999), self.api, self.settings, self.storage)
        self.pool.request.assert_not_awaited()

    async def test_expired_selection_and_old_room_are_rejected(self):
        await self.menu()
        choice = self.choices[(self.user_id, "room_ping_choices")][0]
        token = "roomping:pick:" + choice["token"]
        choice["expiresAt"] = 0
        self.pool.request.reset_mock()
        await group_ping_player(self.callback(token), self.api, self.settings, self.storage)
        self.pool.request.assert_not_awaited()

    async def test_server_cooldown_is_shown_without_another_message(self):
        await self.menu()
        choice = self.choices[(self.user_id, "room_ping_choices")][0]
        self.pool.request.side_effect = ApiError("Игрока уже позвали", 429)
        self.pool.mutate.reset_mock()
        callback = self.callback("roomping:pick:" + choice["token"])
        await group_ping_player(callback, self.api, self.settings, self.storage)
        callback.answer.assert_awaited_once_with("Игрока уже позвали", show_alert=True)
        self.pool.mutate.assert_not_awaited()

    async def test_room_card_offers_dota_id_inside_current_chat(self):
        self.pool.finish_card = AsyncMock()
        self.pool.report = AsyncMock()
        self.pool.request.return_value = {"generation": 4, "name": "Test", "members": [
            {"name": "Alice", "role": "1", "mmr": 0, "dotaAccountId": None},
            {"name": "Bob", "role": "2", "mmr": 1200, "dotaAccountId": "123456789"}]}
        await self.pool.update_card(self.room)
        markup = self.pool.mutate.await_args.kwargs["reply_markup"]
        buttons = [button for row in markup.inline_keyboard for button in row]
        self.assertTrue(any(button.callback_data == f"roomping:{self.room_id}:4" for button in buttons))
        self.assertTrue(any(button.callback_data == f"roomdota:{self.room_id}:4" for button in buttons))
        self.assertIn("0 MMR", self.pool.mutate.await_args.args[2])

    async def test_chat_ready_offers_id_only_when_missing_and_updates_same_notice(self):
        fresh = {"partyId": self.party_id, "inviteLink": "https://t.me/+qa", "generation": 4, "membershipId": "own", "dotaAccountId": None}
        self.api.user.return_value = {"id": self.party_id, "slug": "test", "name": "Test", "maxMembers": 5,
            "expiresAt": self.room["data"]["expiresAt"], "members": [
                {"userId": "alice", "membershipId": "own", "isSelf": True, "positionRole": "1"},
                {"userId": "bob", "membershipId": "peer", "isSelf": False, "positionRole": "2"}]}
        self.pool.for_user = AsyncMock(return_value=fresh)
        await self.pool.refresh_hint(self.user_id, self.party_id, self.room)
        first = self.bot.send_message.await_args.kwargs["reply_markup"]
        self.assertEqual(len(first.inline_keyboard), 2)
        fresh["dotaAccountId"] = "123456789"
        await self.pool.refresh_hint(self.user_id, self.party_id, self.room)
        self.assertEqual(self.bot.send_message.await_count, 1)
        self.assertEqual(len(self.bot.edit_message_text.await_args.kwargs["reply_markup"].inline_keyboard), 1)

    async def test_dota_id_form_returns_to_party_and_never_uses_group_fsm(self):
        state = FSMContext(MemoryStorage(), StorageKey(bot_id=12345, chat_id=self.user_id, user_id=self.user_id))
        self.api.user.return_value = {"dotaAccountId": None}
        with patch("bot.handlers.registration.begin_panel_transition", new=AsyncMock()), patch("bot.handlers.registration.edit_panel_content", new=AsyncMock()):
            await start_standalone_dota_id(self.bot, state, self.api, self.settings, self.storage, self.user_id, self.chat_id, return_screen="party")
            self.api.user.assert_not_awaited()
            await start_standalone_dota_id(self.bot, state, self.api, self.settings, self.storage, self.user_id, self.user_id, return_screen="party")
        self.assertEqual(await state.get_state(), DotaIdOnlyWizard.dota_id.state)
        self.assertEqual((await state.get_data())["return_screen"], "party")

    async def test_dota_id_deep_link_rechecks_current_party(self):
        self.api.user.return_value = {"parties": [{"id": self.party_id, "kind": "PARTY", "isMember": True}]}
        message = SimpleNamespace(chat=SimpleNamespace(type="private", id=self.user_id), from_user=SimpleNamespace(id=self.user_id, full_name="Alice", username="alice"),
                                  bot=self.bot, answer=AsyncMock())
        command = SimpleNamespace(args="dotaid_" + self.party_id.replace("-", ""))
        with patch("bot.handlers.registration.start_standalone_dota_id", new=AsyncMock()) as form:
            await open_party_dota_id(message, command, object(), self.api, self.settings, self.storage)
            form.assert_awaited_once()
            self.api.user.return_value = {"parties": []}
            await open_party_dota_id(message, command, object(), self.api, self.settings, self.storage)
            self.assertEqual(form.await_count, 1)

    async def test_missing_id_readiness_requests_reply_in_group(self):
        self.pool.request.side_effect = [ApiError("Укажи Dota ID, чтобы команда могла пригласить тебя в игру.", 400),
            {"partyId": self.party_id, "generation": 4, "membershipId": "own"}]
        callback = self.callback(f"roomready:{self.room_id}:4")
        await group_ready(callback, self.api, self.settings, self.storage)
        self.assertEqual(self.pool.mutate.await_args.args[0], "send_message")
        self.assertTrue(self.pool.mutate.await_args.kwargs["reply_markup"].force_reply)
        self.assertTrue(self.pool.mutate.await_args.kwargs["reply_markup"].selective)
        self.assertIn("Dota ID", self.pool.mutate.await_args.args[2])

    async def test_required_id_form_explains_readiness_instead_of_optional_skip(self):
        state = FSMContext(MemoryStorage(), StorageKey(bot_id=12345, chat_id=self.user_id, user_id=self.user_id))
        self.api.user.return_value = {"dotaAccountId": None}
        with patch("bot.handlers.registration.begin_panel_transition", new=AsyncMock()), patch("bot.handlers.registration.edit_panel_content", new=AsyncMock()) as panel:
            await start_standalone_dota_id(self.bot, state, self.api, self.settings, self.storage, self.user_id, self.user_id,
                return_screen="party", required_for_ready=True)
        self.assertTrue((await state.get_data())["required_for_ready"])
        self.assertIn("Готов играть", panel.await_args.args[6])
        self.assertNotIn("необязательно", panel.await_args.args[6])
        self.assertEqual(panel.await_args.args[7].inline_keyboard[0][0].text, "← В пати")
