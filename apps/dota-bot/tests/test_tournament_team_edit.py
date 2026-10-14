import asyncio
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock

from aiogram.fsm.context import FSMContext
from aiogram.fsm.storage.base import StorageKey
from aiogram.fsm.storage.memory import MemoryStorage
from cryptography.fernet import Fernet

from bot.api.client import ApiError
from bot.handlers import router, tournament_team_edit as editor
from bot.middlewares import RecordPrivateCallbackActivityMiddleware
from bot.services.panel import edit_panel_content
from bot.services.tournament_participation import company_menu, save_tournament_context, tournament_callback, tournament_status_keyboard
from bot.storage.database import BotStorage
from test_tournaments import IsolatedApi, IsolatedBot, EVENT, ENTRY_ID, USER_ID


class EditorApi(IsolatedApi):
    def __init__(self):
        super().__init__()
        self.state = "JOINED"
        self.entry.update(isCaptain=True, description="Играем вечером")
        self.phase = "TOURNAMENT"
        self.can_rename = True
        self.failure = None

    async def request_user(self, user_id, method, path, body=None):
        root = "/dota/tournaments/" + EVENT["slug"] + "/entries/" + self.entry["id"]
        if method == "GET" and path == root + "/room":
            return {"entryId":self.entry["id"],"name":self.entry["name"],"description":self.entry["description"],
                    "isCaptain":self.entry["isCaptain"],"canEditDescription":self.entry["isCaptain"],
                    "canManageRoster":self.can_rename,"phase":self.phase}
        if method == "PATCH" and path in {root+"/name",root+"/description"}:
            if self.failure:
                raise self.failure
            field = path.rsplit("/",1)[1]
            self.entry[field] = body[field]
            return {"ok":True}
        return await super().request_user(user_id,method,path,body)


class TournamentTeamEditTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.storage = BotStorage(str(Path(self.folder.name)/"bot.db"),Fernet.generate_key())
        self.storage.initialize()
        self.storage.save_session(USER_ID,"test-access","test-refresh")
        self.memory = MemoryStorage()
        self.state = FSMContext(self.memory,StorageKey(bot_id=1,chat_id=USER_ID,user_id=USER_ID))
        self.bot, self.api = IsolatedBot(), EditorApi()
        self.settings = SimpleNamespace(site_url="https://site.example",main_bot_username="FDPdotabot")
        self.context = save_tournament_context(self.storage,USER_ID,EVENT)

    async def asyncTearDown(self):
        await self.memory.close()
        self.storage.close()
        self.folder.cleanup()

    def callback(self, action):
        message = SimpleNamespace(chat=SimpleNamespace(type="private",id=USER_ID),message_id=20)
        return SimpleNamespace(data=tournament_callback(action,self.context["eventHex"]),
                               from_user=SimpleNamespace(id=USER_ID),message=message,bot=self.bot,answer=AsyncMock())

    async def press(self, action):
        await editor.edit_tournament_team(self.callback(action),self.state,self.api,self.settings,self.storage)

    async def send(self, text):
        message = SimpleNamespace(text=text,from_user=SimpleNamespace(id=USER_ID),
                                  chat=SimpleNamespace(type="private",id=USER_ID),bot=self.bot)
        await editor.receive_tournament_team_text(message,self.state,self.api,self.settings,self.storage)

    def writes(self):
        return [call.args for call in self.api.user.await_args_list if call.args[1]=="PATCH"]

    def assert_caption(self):
        self.assertLessEqual(len(self.bot.views[-1][0]),1024)

    async def test_editor_is_routed_before_general_tournament_callbacks_and_only_shown_to_captain(self):
        names = [child.name for child in router.sub_routers]
        self.assertLess(names.index("tournament-team-edit"),names.index("tournaments"))
        for captain in (True,False):
            self.api.entry["isCaptain"] = captain
            keyboard = tournament_status_keyboard(self.api.result(),self.context,self.settings)
            buttons = [button.callback_data for row in keyboard.inline_keyboard for button in row]
            self.assertEqual(any(value and value.startswith("tr:team-edit:") for value in buttons),captain)

    async def test_captain_renames_the_tournament_entry_and_sees_escaped_updated_name(self):
        await self.press("team-name")
        await self.send("  Состав <FDP>  ")
        self.assertEqual(self.writes()[0][2],"/dota/tournaments/"+EVENT["slug"]+"/entries/"+ENTRY_ID+"/name")
        self.assertEqual(self.writes()[0][3],{"name":"Состав <FDP>"})
        self.assertEqual(self.api.parties[0]["name"],"Owned")
        self.assertIn("Состав &lt;FDP&gt;",self.bot.views[-1][0])
        self.assertIsNone(await self.state.get_state())

    async def test_company_captain_also_has_access_to_the_team_editor(self):
        result = self.api.result()
        result["entry"]["company"] = {"confirmed":False,"rosterVersion":"a"*64}
        _,keyboard = company_menu(self.storage,USER_ID,self.context,result,self.settings)
        callbacks = [button.callback_data for row in keyboard.inline_keyboard for button in row]
        self.assertIn(tournament_callback("team-edit",self.context["eventHex"]),callbacks)

    async def test_description_keeps_line_breaks_and_can_be_cleared(self):
        await self.press("team-description")
        await self.send("  Играем вечером\nНужен <саппорт>  ")
        self.assertEqual(self.writes()[0][3],{"description":"Играем вечером\nНужен <саппорт>"})
        self.assertIn("&lt;саппорт&gt;",self.bot.views[-1][0])
        await self.press("team-clear")
        self.assertEqual(self.writes()[-1][3],{"description":""})
        self.assertIn("Пока не добавлено",self.bot.views[-1][0])

    async def test_invalid_names_and_descriptions_do_not_write_and_keep_the_prompt(self):
        for field,invalid in (("name","x"),("name","x"*81),("name","😀"*41),("description","x"*1001)):
            await self.press("team-"+field)
            await self.send(invalid)
            self.assertEqual(self.writes(),[])
            self.assertEqual(await self.state.get_state(),editor.TournamentTeamEdit.value.state)
        await self.send("<"*1000)
        self.assertEqual(len(self.api.entry["description"]),1000)
        self.assert_caption()

    async def test_regular_member_cannot_open_or_submit_a_captains_edit(self):
        self.api.entry["isCaptain"] = False
        await self.press("team-name")
        self.assertIsNone(await self.state.get_state())
        self.assertIn("капитан",self.bot.views[-1][0])
        self.assertEqual(self.writes(),[])

    async def test_lost_captaincy_or_changed_entry_invalidates_the_saved_prompt(self):
        await self.press("team-description")
        self.api.entry["isCaptain"] = False
        await self.send("Не сохранять")
        self.assertEqual(self.writes(),[])
        self.assertIsNone(await self.state.get_state())
        self.api.entry["isCaptain"] = True
        await self.press("team-name")
        self.api.entry["id"] = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        await self.send("Другая команда")
        self.assertEqual(self.writes(),[])

    async def test_network_failure_keeps_a_draft_and_retry_saves_it(self):
        await self.press("team-description")
        self.api.failure = ApiError("offline")
        await self.send("Черновик")
        self.assertEqual((await self.state.get_data())["team_edit"]["value"],"Черновик")
        self.assertIn("черновике",self.bot.views[-1][0])
        from aiogram.types import CallbackQuery,Chat,Message,User
        from datetime import UTC,datetime
        callback = CallbackQuery(id="retry-editor",from_user=User(id=USER_ID,is_bot=False,first_name="QA"),
            chat_instance="qa",message=Message(message_id=20,date=datetime.now(UTC),chat=Chat(id=USER_ID,type="private")),
            data=tournament_callback("team-retry",self.context["eventHex"]))
        data = {"storage":self.storage,"state":self.state,"raw_state":await self.state.get_state()}
        await RecordPrivateCallbackActivityMiddleware()(AsyncMock(),callback,data)
        self.assertEqual((await self.state.get_data())["team_edit"]["value"],"Черновик")
        self.api.failure = None
        await self.press("team-retry")
        self.assertEqual(self.api.entry["description"],"Черновик")
        self.assertIsNone(await self.state.get_state())

    async def test_renaming_is_blocked_after_roster_lock_but_description_remains_editable(self):
        self.api.can_rename = False
        self.api.phase = "TOURNAMENT"
        await self.press("team-edit")
        callbacks = [button.callback_data for row in self.bot.views[-1][1].inline_keyboard for button in row]
        self.assertNotIn(tournament_callback("team-name",self.context["eventHex"]),callbacks)
        self.assertIn(tournament_callback("team-description",self.context["eventHex"]),callbacks)
        await self.press("team-name")
        self.assertEqual(self.writes(),[])

    async def test_failed_description_clear_can_be_retried_without_retyping(self):
        self.api.failure = ApiError("offline",503)
        await self.press("team-clear")
        self.assertEqual((await self.state.get_data())["team_edit"]["value"],"")
        self.api.failure = None
        await self.press("team-retry")
        self.assertEqual(self.api.entry["description"],"")
        self.assertIsNone(await self.state.get_state())

    async def test_other_navigation_cancels_the_prompt_without_affecting_normal_callback(self):
        from aiogram.types import CallbackQuery,Chat,Message,User
        from datetime import UTC,datetime
        await self.press("team-name")
        callback = CallbackQuery(id="leave-editor",from_user=User(id=USER_ID,is_bot=False,first_name="QA"),
            chat_instance="qa",message=Message(message_id=20,date=datetime.now(UTC),chat=Chat(id=USER_ID,type="private")),data="panel:home")
        data = {"storage":self.storage,"state":self.state,"raw_state":await self.state.get_state()}
        handler = AsyncMock(return_value="home")
        self.assertEqual(await RecordPrivateCallbackActivityMiddleware()(handler,callback,data),"home")
        self.assertIsNone(data["raw_state"])
        await self.send("Не менять название")
        self.assertEqual(self.writes(),[])

    async def test_slow_editor_lookup_cannot_restore_the_prompt_after_navigation(self):
        entered,release = asyncio.Event(),asyncio.Event()
        original = self.api.request_user
        async def delayed(user_id,method,path,body=None):
            if path.endswith("/room"):
                entered.set()
                await release.wait()
            return await original(user_id,method,path,body)
        self.api.user.side_effect = delayed
        opening = asyncio.create_task(self.press("team-name"))
        try:
            await asyncio.wait_for(entered.wait(),2)
            from aiogram.types import InlineKeyboardMarkup
            await edit_panel_content(self.bot,self.storage,self.api,self.settings,USER_ID,"account","Аккаунт",
                                     InlineKeyboardMarkup(inline_keyboard=[]),USER_ID)
            release.set()
            await opening
            self.assertEqual(self.storage.get_panel(USER_ID).screen,"account")
            self.assertIsNone(await self.state.get_state())
        finally:
            release.set()
            await asyncio.gather(opening,return_exceptions=True)


if __name__ == "__main__":
    unittest.main()
