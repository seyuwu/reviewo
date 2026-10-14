from datetime import UTC, datetime, timedelta
import asyncio
from aiohttp import web
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch, AsyncMock
from types import SimpleNamespace

from cryptography.fernet import Fernet
from bot.storage.database import BotStorage
from bot.services.rewards_sync import initialize_stream, source_batch, acknowledge_profiles
from bot.services.rewards_ui import marina_phrase, reward_photo, save_reward_photo
from bot.ui.keyboards import home_keyboard
from bot.handlers.rewards import rewards, receive_task_evidence, RewardSubmission
from bot.api.client import OpiniaApi


class RewardsTransportTests(unittest.IsolatedAsyncioTestCase):
    async def test_slow_rewards_requests_leave_the_core_http_connection_available(self):
        release = asyncio.Event()
        saturated = asyncio.Event()
        count = 0
        async def reward(request):
            nonlocal count
            count += 1
            if count == 4:
                saturated.set()
            await release.wait()
            return web.json_response({"ok":True})
        async def core(request):
            return web.json_response({"core":True})
        server = web.Application()
        server.router.add_get("/rewards/me",reward)
        server.router.add_get("/dota/profiles/me",core)
        runner = web.AppRunner(server)
        await runner.setup()
        site = web.TCPSite(runner,"127.0.0.1",0)
        await site.start()
        port = site._server.sockets[0].getsockname()[1]
        api = OpiniaApi(SimpleNamespace(api_base_url=f"http://127.0.0.1:{port}",rewards_enabled=True),SimpleNamespace())
        await api.start()
        # Reach pool saturation with four callers rather than a hundred sockets.
        api.session.connector._limit = 1
        held = [asyncio.create_task(api.public("GET","/rewards/me")) for _ in range(4)]
        try:
            await asyncio.wait_for(saturated.wait(),2)
            result = await asyncio.wait_for(api.public("GET","/dota/profiles/me"),1)
            self.assertEqual(result,{"core":True})
        finally:
            release.set()
            await asyncio.gather(*held,return_exceptions=True)
            await api.close()
            await runner.cleanup()


class RewardStreamTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.storage = BotStorage(str(Path(self.directory.name)/"bot.db"), Fernet.generate_key())
        self.storage.initialize()
        self.source = initialize_stream(self.storage)
        self.now = datetime.now(UTC)
        self.start = (self.now-timedelta(days=1)).isoformat()
        self.at = (self.now-timedelta(minutes=3)).isoformat()

    def tearDown(self):
        self.storage.close()
        self.directory.cleanup()

    def test_records_before_opening_rewards_are_discovered_and_acknowledged_by_cursor(self):
        with patch("bot.storage.database.timestamp", return_value=self.at):
            self.storage.record_funnel_event(7,"account_ready")
            self.storage.record_search_started(7)
        events,cursor = source_batch(self.storage,None,self.start,self.source,self.now)
        self.assertEqual({e["kind"] for e in events},{"account_ready","search_started"})
        self.assertEqual(source_batch(self.storage,cursor,self.start,self.source,self.now)[0],[])
        self.assertEqual(source_batch(self.storage,None,self.start,self.source,self.now)[0],events)  # Retry before ACK.

    def test_short_cancel_does_not_earn_but_successful_join_does(self):
        with patch("bot.storage.database.timestamp", return_value=self.at):
            self.storage.record_search_started(7)
            self.storage.clear_search_timer(7)
            self.storage.record_party_joined(7)
        events,_=source_batch(self.storage,None,self.start,self.source,self.now)
        self.assertEqual([e["kind"] for e in events],["party_joined"])

    def test_maturing_search_waits_without_advancing_cursor(self):
        with patch("bot.storage.database.timestamp", return_value=self.now.isoformat()):
            self.storage.record_search_started(7)
        events,cursor=source_batch(self.storage,None,self.start,self.source,self.now)
        self.assertEqual(events,[])
        self.assertEqual(len(source_batch(self.storage,cursor,self.start,self.source,self.now+timedelta(minutes=3))[0]),1)

    def test_existing_profile_is_rewarded_on_first_post_launch_activity_and_not_every_click(self):
        with patch("bot.storage.database.timestamp",return_value=(self.now-timedelta(days=5)).isoformat()):
            self.storage.record_funnel_event(7,"account_ready")
        with patch("bot.storage.database.timestamp",return_value=self.at):
            self.storage.record_bot_user(7)
        events,cursor=source_batch(self.storage,None,self.start,self.source,self.now)
        self.assertEqual([e["kind"] for e in events],["account_ready"])
        acknowledge_profiles(self.storage,events,self.start)
        with patch("bot.storage.database.timestamp",return_value=self.now.isoformat()):
            self.storage.record_bot_user(7)
        self.assertEqual(source_batch(self.storage,cursor,self.start,self.source,self.now)[0],[])

    def test_batches_are_bounded_and_hot_search_has_no_reward_queries(self):
        queries=[]
        self.storage.connection.set_trace_callback(queries.append)
        with patch("bot.storage.database.timestamp",return_value=self.at):
            for user in range(1,130):self.storage.record_party_created(user)
        self.assertFalse(any("reward" in q.lower() for q in queries))
        self.storage.connection.set_trace_callback(None)
        events,_=source_batch(self.storage,None,self.start,self.source,self.now)
        self.assertLessEqual(len(events),100)

    def test_home_entry_is_optional_and_uses_configured_name(self):
        old=home_keyboard(True,False)
        self.assertFalse(any(b.callback_data=="rewards:home" for row in old.inline_keyboard for b in row))
        new=home_keyboard(True,False,rewards_label="Листочки от Маши")
        self.assertTrue(any("Листочки от Маши" in b.text for row in new.inline_keyboard for b in row))

    def test_character_has_three_scenes_and_reuses_uploaded_file_ids(self):
        for screen in ("rewards:home","rewards:earn","rewards:raffle"):
            photo=reward_photo(self.storage,screen)
            save_reward_photo(self.storage,screen,SimpleNamespace(photo=[SimpleNamespace(file_id="cached-"+screen)]))
            self.assertEqual(reward_photo(self.storage,screen),"cached-"+screen)
            self.assertGreater(len(photo.data),1000)

    def test_phrases_do_not_repeat_and_names_are_escaped(self):
        settings={"mascotName":"<Марина>","phrases":{"home":["Привет","Удачи"]}}
        one=marina_phrase(self.storage,7,settings,"home")
        two=marina_phrase(self.storage,7,settings,"home")
        self.assertNotEqual(one,two)
        self.assertIn("&lt;Марина&gt;",one)


class RewardScreenTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.directory=tempfile.TemporaryDirectory()
        self.storage=BotStorage(str(Path(self.directory.name)/"bot.db"),Fernet.generate_key())
        self.storage.initialize()
        self.settings=SimpleNamespace(rewards_enabled=True)
        self.config={"programName":"Танго от Марины","currencyName":"танго","mascotName":"Марина","tag":"@FDPdotabot","phrases":{key:["Привет!","Удачи!"] for key in ("home","earn","raffle","history")}}
        now=datetime.now(UTC)
        self.giveaway={"id":"22222222-2222-4222-8222-222222222222","title":"Сокровищницы","description":"Выдача в течение недели","ticketPrice":10,"maxTickets":10,"balance":50,"tickets":[],"totalTickets":20,"startsAt":(now-timedelta(days=1)).isoformat(),"endsAt":(now+timedelta(days=1)).isoformat(),"status":"OPEN","draw":None,"prizes":["Сокровищница"]}
        self.page={"settings":self.config,"balance":50,"tasks":[{"key":"daily_party","title":"Первый поиск пати","amount":5,"period":"day","completed":True}],"tags":[],"history":[],"giveaways":[self.giveaway]}
        self.posts=[]
        async def request(user,method,path,body=None):
            if method=="POST":self.posts.append(body);return {"ok":True}
            return self.page if path.startswith("/rewards/me") else self.giveaway
        self.api=SimpleNamespace(user=AsyncMock(side_effect=request))
        self.bot=AsyncMock()
        self.state=AsyncMock()
        self.edit_patch=patch("bot.handlers.rewards.edit_panel_content",new_callable=AsyncMock)
        self.edit=self.edit_patch.start()
        self.transition=patch("bot.handlers.rewards.begin_panel_transition",new_callable=AsyncMock);self.transition.start()
        self.ack=patch("bot.handlers.rewards.acknowledge_callback");self.ack.start()

    async def asyncTearDown(self):
        self.edit_patch.stop();self.transition.stop();self.ack.stop()
        self.storage.close();self.directory.cleanup()

    async def visit(self,data):
        callback=SimpleNamespace(data=data,from_user=SimpleNamespace(id=7),message=SimpleNamespace(chat=SimpleNamespace(id=7,type="private")))
        await rewards(callback,self.bot,self.api,self.storage,self.settings,self.state)
        self.assertLessEqual(len(self.edit.call_args.args[6]),1024)
        return self.edit.call_args

    async def test_each_screen_changes_the_character_image_and_completed_tasks_need_no_claim(self):
        expected=[("rewards:home","marina-home.png"),("rewards:earn:0","marina-earn.png"),("rewards:raffle:"+self.giveaway["id"],"marina-raffle.png")]
        for action,filename in expected:
            call=await self.visit(action)
            self.assertEqual(call.kwargs["media_photo"].filename,filename)
        self.assertEqual(self.posts,[])

    async def test_purchase_confirmation_reuses_request_id_on_retry(self):
        await self.visit("rewards:buy:"+self.giveaway["id"]+":3")
        pending=self.storage.get_choice(7,"reward_purchase",0)
        await self.visit("rewards:confirm:"+pending["token"])
        await self.visit("rewards:confirm:"+pending["token"])
        self.assertEqual(len(self.posts),2)
        self.assertEqual(self.posts[0],self.posts[1])
        self.assertEqual(self.posts[0]["quantity"],3)

    async def test_stale_confirmation_cannot_spend(self):
        await self.visit("rewards:confirm:expired")
        self.assertEqual(self.posts,[])
        self.assertIn("устарело",self.edit.call_args.args[6])

    async def test_dynamic_task_pages_reach_every_task_and_never_show_steam(self):
        self.page["tasks"] = [{"key":"custom_" + str(i).zfill(32), "title":f"Задание {i}",
          "description":"Выполни действие", "amount":5, "period":"once", "condition":"manual", "completed":False}
          for i in range(14)]
        call = await self.visit("rewards:earn:4")
        self.assertIn("Задание 13", call.args[6])
        self.assertNotIn("Steam", call.args[6])
        self.assertIn("rewards:earn:3", [b.callback_data for row in call.args[7].inline_keyboard for b in row])

    async def test_manual_proof_is_submitted_once_to_the_selected_task(self):
        task_key = "custom_" + "1"*32
        self.page["tasks"] = [{"key":task_key, "title":"Полезный отзыв", "description":"Пришли ссылку",
          "amount":7, "period":"once", "condition":"manual", "completed":False}]
        await self.visit("rewards:submit:" + task_key)
        self.state.set_state.assert_awaited_once_with(RewardSubmission.evidence)
        self.state.get_data.return_value = {"reward_task_key":task_key}
        message = SimpleNamespace(from_user=SimpleNamespace(id=7),text="https://example.com/proof",
                                 bot=self.bot,chat=SimpleNamespace(id=7))
        await receive_task_evidence(message,self.api,self.storage,self.settings,self.state)
        self.assertEqual(self.posts,[{"evidence":"https://example.com/proof"}])
        self.assertEqual(self.api.user.await_args.args[2],f"/rewards/tasks/{task_key}/submissions")
        self.assertIn("Заявка отправлена",self.edit.call_args.args[6])

    async def test_pending_manual_proof_cannot_open_another_submission_prompt(self):
        task_key = "custom_" + "2"*32
        self.page["tasks"] = [{"key":task_key,"title":"Отзыв","description":"Ссылка","amount":7,
          "period":"once","condition":"manual","completed":False,"submission":{"status":"PENDING"}}]
        await self.visit("rewards:submit:" + task_key)
        self.state.set_state.assert_not_awaited()
        self.assertEqual(self.posts,[])

    async def test_retired_steam_button_makes_no_verification_request(self):
        await self.visit("rewards:tag:steam")
        self.assertEqual(self.posts,[])
        self.assertIn("Steam убрано",self.edit.call_args.args[6])
