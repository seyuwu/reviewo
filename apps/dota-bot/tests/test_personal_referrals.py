import asyncio
from datetime import UTC, datetime
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch
from urllib.parse import parse_qs, urlparse

from aiogram import Bot, Dispatcher
from aiogram.exceptions import TelegramBadRequest
from aiogram.methods import DeleteMessage, EditMessageText
from aiogram.types import Chat, Message, MessageEntity, Update, User
from cryptography.fernet import Fernet

from bot.middlewares import (
    DeletePrivateMessagesMiddleware, RecordPrivateCallbackActivityMiddleware,
    TelegramUsernameSyncMiddleware,
)
from bot.services.start_links import (
    bot_friend_invite_url, parse_acquisition_tag,
    parse_party_start_payload, parse_referral_start_payload,
)
from bot.storage.database import BotStorage
from bot.ui.keyboards import home_keyboard, party_invitation_keyboard


class PersonalReferralStorageTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.path = str(Path(self.folder.name) / 'bot.db')
        self.key = Fernet.generate_key()
        self.storage = BotStorage(self.path, self.key)
        self.storage.initialize()
        self.storage.record_bot_user(100)
        self.code = self.storage.referral_code(100, 'Inviter', 'InviterTag')

    def tearDown(self):
        self.storage.close()
        self.folder.cleanup()

    def invite(self, user_id=101, code=None):
        self.storage.record_bot_user(user_id, referral_code=code or self.code,
                                     display_name='Friend', username='FriendTag')

    def test_personal_link_round_trip_and_telegram_limit(self):
        link = bot_friend_invite_url('FDPdotabot', self.code)
        payload = parse_qs(urlparse(link).query)['start'][0]
        self.assertEqual(parse_referral_start_payload(payload), self.code)
        self.assertIsNone(parse_party_start_payload(payload))
        self.assertIsNone(parse_acquisition_tag(payload))
        self.assertLessEqual(len(payload), 64)
        self.assertNotIn('?start=ref_100', link)

    def test_party_token_is_unchanged_for_all_supported_characters_and_lengths(self):
        for token in ['abc123', 'm6QvueE', 'Ab_c-123', 'a_ref_b', 'ABCDEFGHIJKLMNOP']:
            with self.subTest(token=token):
                payload = f'party_{token}_ref_{self.code}'
                self.assertEqual(parse_party_start_payload(payload), token)
                self.assertEqual(parse_referral_start_payload(payload), self.code)
                self.assertLessEqual(len(payload), 64)
                self.assertEqual(parse_party_start_payload(f'party_{token}'), token)

    def test_first_start_is_attributed_once_and_cannot_switch_inviter(self):
        self.invite()
        second = self.storage.referral_code(102, 'Another')
        self.invite(code=second)
        self.storage.record_bot_user(101, 'steam', 'another_campaign')
        rows = self.storage.pending_referrals()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['inviter_telegram_id'], 100)
        source = self.storage._connection().execute(
            'SELECT acquisition_source,acquisition_campaign FROM bot_users WHERE telegram_user_id=101'
        ).fetchone()
        self.assertEqual(tuple(source), ('referral', 'personal'))

    def test_known_self_and_unknown_invites_are_not_counted(self):
        self.storage.record_bot_user(101, 'steam', 'discussion_01')
        self.invite()
        self.invite(user_id=100)
        self.invite(user_id=102, code='f'*24)
        self.assertEqual(self.storage.pending_referrals(), [])

    def test_links_and_outbox_survive_restart(self):
        self.invite()
        self.storage.close()
        self.storage = BotStorage(self.path, self.key)
        self.storage.initialize()
        self.assertEqual(self.storage.referral_code(100), self.code)
        self.assertEqual(len(self.storage.pending_referrals()), 1)

    def test_activity_during_upload_is_not_lost_or_counted_twice(self):
        self.invite()
        uploaded = self.storage.pending_referrals()
        self.storage.record_search_started(101)
        self.storage.finish_referral_sync(uploaded)
        pending = self.storage.pending_referrals()
        self.assertEqual(len(pending), 1)
        self.assertIsNotNone(pending[0]['search_started_at'])
        self.storage.finish_referral_sync(pending)
        self.assertEqual(self.storage.pending_referrals(), [])
        self.storage.record_search_started(101)
        self.assertEqual(self.storage.pending_referrals(), [])


class FullStartRoutingTests(unittest.IsolatedAsyncioTestCase):
    async def test_actual_router_chain_and_middlewares_recover_menu_and_preserve_party_token(self):
        # Use the actual application router ordering, not a standalone deep-link filter.
        from bot.handlers import router
        from bot.handlers.registration import GuestProfileWizard
        with tempfile.TemporaryDirectory() as folder:
            storage = BotStorage(str(Path(folder) / 'bot.db'), Fernet.generate_key())
            storage.initialize()
            storage.record_bot_user(900)
            referral = storage.referral_code(900, 'Inviter', 'InviterTag')
            bot = Bot('123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi')
            dispatcher = Dispatcher()
            dispatcher.include_router(router)
            dispatcher.message.outer_middleware(DeletePrivateMessagesMiddleware())
            dispatcher.callback_query.outer_middleware(RecordPrivateCallbackActivityMiddleware())
            username_sync = TelegramUsernameSyncMiddleware()
            dispatcher.message.outer_middleware(username_sync)
            settings = SimpleNamespace(site_url='https://dota.opinia.ru')
            api = SimpleNamespace(public=AsyncMock(), ensure_telegram_link=AsyncMock())
            cases = [
                ('', 'home', 'direct', False),
                ('src_seo', 'home', 'seo', False),
                ('src_steam_discussion_01', 'home', 'steam', False),
                ('src_referral_friends', 'home', 'referral', False),
                (f'ref_{referral}', 'home', 'referral', True),
                ('ref_'+'f'*24, 'home', 'direct', False),
                ('ref_broken', 'home', 'direct', False),
                ('party_m6QvueE', 'party:invitation', 'party_invite', False),
                (f'party_m6QvueE_ref_{referral}', 'party:invitation', 'party_invite', True),
                ('party_m6QvueE_ref_'+'f'*24, 'party:invitation', 'party_invite', False),
            ]
            user_id = 1000
            try:
                for payload, screen, source, is_personal in cases:
                    for previous in ('new', 'existing', 'deleted'):
                        for wizard in (False, True):
                            with self.subTest(payload=payload, previous=previous, wizard=wizard):
                                user_id += 1
                                if previous != 'new':
                                    storage.record_bot_user(user_id, 'steam', 'original')
                                    storage.save_panel(user_id, user_id, 10, 'account', False)
                                state = dispatcher.fsm.get_context(bot=bot, chat_id=user_id, user_id=user_id)
                                if wizard:
                                    await state.set_state(GuestProfileWizard.display_name)
                                    await state.update_data(old_form_value='unfinished')
                                # Alternate plain /start and an explicit bot mention.
                                command = '/start@FDPdotabot' if wizard else '/start'
                                text = command + (f' {payload}' if payload else '')
                                update = Update(update_id=user_id, message=Message(
                                    message_id=50, date=datetime.now(UTC),
                                    chat=Chat(id=user_id, type='private'),
                                    from_user=User(id=user_id, is_bot=False, first_name='Friend', username='FriendTag'),
                                    text=text, entities=[MessageEntity(type='bot_command', offset=0, length=len(command))],
                                ))
                                delivered = []
                                api.public.reset_mock()
                                async def public(method, path, body=None):
                                    if path == '/social/parties/join-codes/m6QvueE':
                                        return {'slug': 'qa-party'}
                                    if path == '/social/parties/qa-party':
                                        return {'name': 'QA party', 'slug': 'qa-party', 'members': [], 'recruitedRoles': ['2','3']}
                                    raise AssertionError(f'Unexpected invitation path: {path}')
                                api.public.side_effect = public
                                async def sent(*args, **kwargs):
                                    delivered.append(kwargs.get('caption') or (args[1] if len(args)>1 else kwargs.get('text')))
                                    return SimpleNamespace(chat=SimpleNamespace(id=user_id), message_id=70+len(delivered), photo=[])
                                async def delete_old(chat_id, message_id, **kwargs):
                                    if previous == 'deleted' and message_id == 10:
                                        raise TelegramBadRequest(method=DeleteMessage(chat_id=user_id,message_id=10),message='message to delete not found')
                                missing = TelegramBadRequest(method=EditMessageText(text='test'), message='message to edit not found')
                                with patch('bot.services.panel.render_screen', new_callable=AsyncMock, return_value=(
                                        'Добро пожаловать в FDP', home_keyboard(False, False, can_share=True))), \
                                     patch.object(bot, 'get_me', new_callable=AsyncMock, return_value=User(id=bot.id,is_bot=True,first_name='FDP',username='FDPdotabot')), \
                                     patch.object(bot, 'send_photo', new_callable=AsyncMock, side_effect=sent), \
                                     patch.object(bot, 'send_message', new_callable=AsyncMock, side_effect=sent), \
                                     patch.object(bot, 'delete_message', new_callable=AsyncMock, side_effect=delete_old), \
                                     patch.object(bot, 'edit_message_media', new_callable=AsyncMock, side_effect=missing if previous=='deleted' else None) as edit_media, \
                                     patch.object(bot, 'edit_message_text', new_callable=AsyncMock, side_effect=missing if previous=='deleted' else None) as edit_text:
                                    await dispatcher.feed_update(bot, update, api=api, settings=settings, storage=storage)
                                    self.assertEqual(storage.get_panel(user_id).screen, screen)
                                    if screen == 'home':
                                        self.assertIn('Добро пожаловать в FDP', delivered)
                                        edit_media.assert_not_awaited()
                                        edit_text.assert_not_awaited()
                                        self.assertEqual(len(delivered), 1)
                                    else:
                                        self.assertTrue(any('QA party' in str(value) for value in delivered))
                                        self.assertEqual(api.public.await_count, 2)
                                self.assertIsNone(await state.get_state())
                                attribution = storage._connection().execute(
                                    'SELECT acquisition_source FROM bot_users WHERE telegram_user_id=?', (user_id,)
                                ).fetchone()[0]
                                self.assertEqual(attribution, source if previous=='new' else 'steam')
                                row = storage._connection().execute(
                                    'SELECT inviter_telegram_id FROM bot_referrals WHERE invitee_telegram_id=?', (user_id,)
                                ).fetchone()
                                self.assertEqual(row is not None, is_personal and previous=='new')
                                if row:
                                    self.assertEqual(row[0], 900)
            finally:
                await username_sync.close()
                await dispatcher.storage.close()
                await bot.session.close()
                storage.close()


class PersonalPartyRoleTests(unittest.IsolatedAsyncioTestCase):
    async def test_new_friend_registration_remembers_original_token_and_chosen_role(self):
        from aiogram.fsm.context import FSMContext
        from aiogram.fsm.storage.base import StorageKey
        from aiogram.fsm.storage.memory import MemoryStorage
        from bot.handlers.party_links import join_party_from_link
        from bot.handlers.registration import GuestProfileWizard
        with tempfile.TemporaryDirectory() as folder:
            storage = BotStorage(str(Path(folder) / 'bot.db'), Fernet.generate_key())
            storage.initialize()
            storage.record_bot_user(100)
            referral = storage.referral_code(100)
            storage.record_bot_user(101, 'party_invite', referral_code=referral)
            code = parse_party_start_payload(f'party_m6QvueE_ref_{referral}')
            state_storage = MemoryStorage()
            state = FSMContext(storage=state_storage,key=StorageKey(bot_id=123456,chat_id=101,user_id=101))
            party = {'name':'QA party','slug':'qa-party','members':[],'recruitedRoles':['2']}
            api = SimpleNamespace(public=AsyncMock(side_effect=[{'slug':'qa-party'},party]),user=AsyncMock())
            callback = SimpleNamespace(data=f'partyinvite:join:{code}:2',from_user=User(id=101,is_bot=False,first_name='Friend'),
                                       message=SimpleNamespace(chat=SimpleNamespace(id=101)),bot=object(),answer=AsyncMock())
            try:
                with patch('bot.handlers.party_links.begin_panel_transition', new_callable=AsyncMock), \
                     patch('bot.handlers.registration.edit_panel_content', new_callable=AsyncMock) as panel:
                    await join_party_from_link(callback,state,api,SimpleNamespace(site_url='https://dota.opinia.ru'),storage)
                    await asyncio.sleep(0)
                    data = await state.get_data()
                    self.assertEqual(data['party_invite_code'],'m6QvueE')
                    self.assertEqual(data['party_invite_role'],'2')
                    self.assertEqual(data['display_name'],'Friend')
                    self.assertEqual(await state.get_state(),GuestProfileWizard.mmr.state)
                    self.assertEqual(panel.await_args.args[5],'register:mmr')
                    api.user.assert_not_awaited()
            finally:
                await state_storage.close()
                storage.close()

    async def test_role_click_passes_only_original_party_token_and_records_join(self):
        from bot.handlers.party_links import join_party_from_link
        with tempfile.TemporaryDirectory() as folder:
            storage = BotStorage(str(Path(folder) / 'bot.db'), Fernet.generate_key())
            storage.initialize()
            storage.record_bot_user(100)
            referral = storage.referral_code(100)
            payload = f'party_m6QvueE_ref_{referral}'
            storage.record_bot_user(101, 'party_invite', referral_code=parse_referral_start_payload(payload))
            storage.save_session(101, 'test-access', 'test-refresh')
            code = parse_party_start_payload(payload)
            keyboard = party_invitation_keyboard(code, ['2'], False)
            role_button = next(button for row in keyboard.inline_keyboard for button in row
                               if (button.callback_data or '').startswith('partyinvite:join:'))
            self.assertEqual(role_button.callback_data, 'partyinvite:join:m6QvueE:2')
            party = {'name':'QA party','slug':'qa-party','members':[],'recruitedRoles':['2']}
            api = SimpleNamespace(public=AsyncMock(side_effect=[{'slug':'qa-party'}, party]),
                                  user=AsyncMock(side_effect=[{}, {'isMember':True,'slug':'qa-party'}]))
            callback = SimpleNamespace(data=role_button.callback_data, from_user=User(id=101,is_bot=False,first_name='Friend'),
                                       message=SimpleNamespace(chat=SimpleNamespace(id=101)),bot=object(),answer=AsyncMock())
            try:
                with patch('bot.handlers.party_links.begin_panel_transition', new_callable=AsyncMock), \
                     patch('bot.services.party_notifications.deliver_join_hint', new_callable=AsyncMock), \
                     patch('bot.handlers.party_links.edit_panel', new_callable=AsyncMock) as panel:
                    await join_party_from_link(callback, object(), api, SimpleNamespace(site_url='https://dota.opinia.ru'), storage)
                    await asyncio.sleep(0)
                    api.user.assert_awaited_with(101, 'POST', '/social/parties/join', {'token':'m6QvueE','positionRole':'2'})
                    panel.assert_awaited_once()
                    self.assertIsNotNone(storage.pending_referrals()[0]['party_joined_at'])
            finally:
                storage.close()


if __name__ == '__main__':
    unittest.main()
