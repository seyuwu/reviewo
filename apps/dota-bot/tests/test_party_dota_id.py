import asyncio
import time
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

from aiogram import Dispatcher
from aiogram.types import Message, Update
from datetime import UTC, datetime

from bot.api.client import ApiError
from bot.handlers.party_dota_id import CHOICE, request_group_dota_id, receive_group_dota_id
from bot.handlers.party_rooms import create_room_worker_router, consume_group_message, router
from test_party_room_controls import RoomControlFixture


class GroupDotaIdTests(RoomControlFixture, unittest.IsolatedAsyncioTestCase):
    async def prompt(self):
        self.pool.request.return_value = {"partyId": self.party_id, "generation": 4, "membershipId": "own"}
        await request_group_dota_id(self.callback(f"roomdota:{self.room_id}:4"), self.api, self.settings, self.storage)
        self.pool.request.reset_mock()
        return self.storage.get_choice(self.user_id, CHOICE, 0)

    def reply(self, text="123456789", user=None, prompt_id=77):
        return SimpleNamespace(chat=SimpleNamespace(id=self.chat_id, type="supergroup"), text=text,
            from_user=SimpleNamespace(id=user or self.user_id, is_bot=False, full_name="Alice <QA>"), sender_chat=None,
            reply_to_message=SimpleNamespace(message_id=prompt_id, from_user=SimpleNamespace(id=self.bot.id)))

    async def test_reply_saves_own_id_confirms_ready_and_consumes_prompt(self):
        context = await self.prompt()
        self.assertEqual(context["botId"], self.bot.id)
        self.pool.request.return_value = {"saved": True, "ready": True}
        await receive_group_dota_id(self.reply(" 123456789 "), self.api, self.settings, self.storage)
        self.pool.request.assert_awaited_once_with("POST", f"/{self.room_id}/dota-id", {
            "userId": str(self.user_id), "generation": 4, "partyId": self.party_id, "membershipId": "own", "dotaAccountId": "123456789"})
        self.assertIsNone(self.storage.get_choice(self.user_id, CHOICE, 0))
        self.assertTrue(self.pool.wakeup.is_set())
        self.assertIn("Готовность подтверждена", self.pool.mutate.await_args.args[2])
        self.assertIn("Alice &lt;QA&gt;", self.pool.mutate.await_args.args[2])
        await receive_group_dota_id(self.reply(), self.api, self.settings, self.storage)
        self.assertEqual(self.pool.request.await_count, 1)

    async def test_ignores_foreign_replies_wrong_prompt_bot_chat_and_plain_numbers(self):
        await self.prompt()
        messages = [self.reply(user=99), self.reply(prompt_id=999), self.reply(), self.reply(), self.reply()]
        messages[2].reply_to_message.from_user.id = 54321
        messages[3].chat.id = -10011111111
        messages[4].reply_to_message = None
        for message in messages:
            await receive_group_dota_id(message, self.api, self.settings, self.storage)
        self.pool.request.assert_not_awaited()
        self.assertIsNotNone(self.storage.get_choice(self.user_id, CHOICE, 0))

    async def test_invalid_id_reprompts_without_api_requests(self):
        await self.prompt()
        self.pool.mutate.return_value = SimpleNamespace(message_id=88)
        await receive_group_dota_id(self.reply("https://steamcommunity.com/test"), self.api, self.settings, self.storage)
        self.pool.request.assert_not_awaited()
        self.assertTrue(self.pool.mutate.await_args.kwargs["reply_markup"].force_reply)
        self.assertEqual(self.storage.get_choice(self.user_id, CHOICE, 0)["promptId"], 88)
        await receive_group_dota_id(self.reply(prompt_id=77), self.api, self.settings, self.storage)
        self.pool.request.assert_not_awaited()

    async def test_expired_request_and_reassigned_group_do_not_save(self):
        context = await self.prompt()
        context["expiresAt"] = time.time() - 1
        await receive_group_dota_id(self.reply(), self.api, self.settings, self.storage)
        self.pool.request.assert_not_awaited()
        self.assertIsNone(self.storage.get_choice(self.user_id, CHOICE, 0))
        self.pool.dota_id_cooldowns.clear()
        await self.prompt()
        self.room["generation"] = 5
        await receive_group_dota_id(self.reply(), self.api, self.settings, self.storage)
        self.pool.request.assert_not_awaited()

    async def test_duplicate_id_can_be_corrected_and_stale_membership_clears_prompt(self):
        await self.prompt()
        self.pool.request.side_effect = ApiError("This Dota Account ID is already linked to another profile", 409)
        await receive_group_dota_id(self.reply(), self.api, self.settings, self.storage)
        self.assertIn("уже привязан", self.pool.mutate.await_args.args[2])
        self.assertIsNotNone(self.storage.get_choice(self.user_id, CHOICE, 0))
        self.pool.request.side_effect = ApiError("Party membership changed", 409)
        await receive_group_dota_id(self.reply(), self.api, self.settings, self.storage)
        self.assertIsNone(self.storage.get_choice(self.user_id, CHOICE, 0))
        self.assertIn("состав изменились", self.pool.mutate.await_args.args[2])

    async def test_uncertain_api_result_allows_explicit_retry_without_claiming_success(self):
        await self.prompt()
        self.pool.request.side_effect = ApiError("Timeout", 0)
        await receive_group_dota_id(self.reply(), self.api, self.settings, self.storage)
        self.assertIn("ID мог сохраниться", self.pool.mutate.await_args.args[2])
        self.assertNotIn("Готовность подтверждена", self.pool.mutate.await_args.args[2])
        self.assertIsNotNone(self.storage.get_choice(self.user_id, CHOICE, 0))

    async def test_changed_party_after_save_does_not_claim_ready(self):
        await self.prompt()
        self.pool.request.return_value = {"saved": True, "ready": False}
        await receive_group_dota_id(self.reply(), self.api, self.settings, self.storage)
        self.assertIn("готовность не подтверждена", self.pool.mutate.await_args.args[2])
        self.assertIsNone(self.storage.get_choice(self.user_id, CHOICE, 0))

    async def test_concurrent_replies_send_one_save_request(self):
        await self.prompt()
        async def save(*args):
            await asyncio.sleep(0)
            return {"saved": True, "ready": True}
        self.pool.request.side_effect = save
        await asyncio.gather(*(receive_group_dota_id(self.reply(), self.api, self.settings, self.storage) for _ in range(2)))
        self.assertEqual(self.pool.request.await_count, 1)

    async def test_both_routers_handle_id_replies_before_generic_group_consumer(self):
        for selected in (router, create_room_worker_router()):
            handlers = [handler.callback for handler in selected.message.handlers]
            self.assertLess(handlers.index(receive_group_dota_id), handlers.index(consume_group_message))
            self.assertIn(request_group_dota_id, [handler.callback for handler in selected.callback_query.handlers])

    async def test_helper_dispatcher_actually_routes_a_reply_and_keeps_private_fsm_separate(self):
        await self.prompt()
        self.pool.request.return_value = {"saved": True, "ready": True}
        # Real Telegram models and real aiogram router, including its broad group consumer.
        now = datetime.now(UTC)
        incoming = Message(message_id=90, date=now, chat={"id": self.chat_id, "type": "supergroup"},
            from_user={"id": self.user_id, "is_bot": False, "first_name": "QA"}, text="123456789",
            reply_to_message={"message_id":77,"date":now,"chat":{"id":self.chat_id,"type":"supergroup"},
                "from_user":{"id":self.bot.id,"is_bot":True,"first_name":"FDP"},"text":"Dota ID"})
        dispatcher = Dispatcher()
        dispatcher.include_router(create_room_worker_router())
        private_state = dispatcher.fsm.get_context(bot=self.bot, chat_id=self.user_id, user_id=self.user_id)
        await private_state.set_state("ProfileEditWizard:mmr")
        await private_state.update_data(keep="private draft")
        await dispatcher.feed_update(self.bot, Update(update_id=1,message=incoming), api=self.api,settings=self.settings,storage=self.storage)
        self.pool.request.assert_awaited_once()
        self.assertEqual(await private_state.get_state(), "ProfileEditWizard:mmr")
        self.assertEqual(await private_state.get_data(), {"keep": "private draft"})
        await dispatcher.storage.close()
