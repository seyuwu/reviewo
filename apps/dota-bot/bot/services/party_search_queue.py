import asyncio
import logging
import time
from dataclasses import dataclass
from urllib.parse import quote

from aiogram import Bot
from aiogram.exceptions import TelegramAPIError, TelegramBadRequest
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from ..api.client import ApiError, OpiniaApi
from ..config import Settings
from ..storage.database import BotStorage
from .panel import edit_panel

logger = logging.getLogger(__name__)
ROLES = {"1", "2", "3", "4", "5"}
BURST_WINDOW_SECONDS = 0.12


@dataclass(frozen=True)
class PartySearchAction:
    kind: str
    chat_id: int
    role: str | None = None


@dataclass
class OptimisticPartyPanel:
    chat_id: int
    message_id: int
    markup: InlineKeyboardMarkup
    available_roles: set[str]
    searching_roles: set[str]


class PartySearchQueue:
    """Apply rapid party-slot search taps together, then refresh the panel once."""

    def __init__(
        self,
        bot: Bot,
        api: OpiniaApi,
        settings: Settings,
        storage: BotStorage,
        match_wakeup: asyncio.Event,
    ) -> None:
        self.bot = bot
        self.api = api
        self.settings = settings
        self.storage = storage
        self.match_wakeup = match_wakeup
        self._pending: dict[int, list[PartySearchAction]] = {}
        self._workers: dict[int, asyncio.Task[None]] = {}
        self._reminders: set[asyncio.Task[None]] = set()
        self._panel_locks: dict[int, asyncio.Lock] = {}
        self._optimistic_panels: dict[int, OptimisticPartyPanel] = {}
        self._closed = False

    async def enqueue(
        self,
        telegram_user_id: int,
        chat_id: int,
        kind: str,
        role: str | None = None,
        message_id: int | None = None,
        markup: InlineKeyboardMarkup | None = None,
    ) -> None:
        if self._closed:
            return
        self._pending.setdefault(telegram_user_id, []).append(
            PartySearchAction(kind=kind, chat_id=chat_id, role=role)
        )
        self._ensure_worker(telegram_user_id)
        if message_id is not None and markup is not None:
            await self._update_panel_immediately(
                telegram_user_id, chat_id, message_id, markup, kind, role
            )

    def _ensure_worker(self, telegram_user_id: int) -> None:
        worker = self._workers.get(telegram_user_id)
        if worker is None or worker.done():
            self._workers[telegram_user_id] = asyncio.create_task(
                self._drain(telegram_user_id)
            )

    async def _update_panel_immediately(
        self,
        telegram_user_id: int,
        chat_id: int,
        message_id: int,
        current_markup: InlineKeyboardMarkup,
        kind: str,
        role: str | None,
    ) -> None:
        lock = self._panel_locks.setdefault(telegram_user_id, asyncio.Lock())
        async with lock:
            panel = self._optimistic_panels.get(telegram_user_id)
            if (
                panel is None
                or panel.chat_id != chat_id
                or panel.message_id != message_id
            ):
                available, searching = self._read_search_roles(current_markup)
                panel = OptimisticPartyPanel(
                    chat_id=chat_id,
                    message_id=message_id,
                    markup=current_markup,
                    available_roles=available,
                    searching_roles=searching,
                )
                self._optimistic_panels[telegram_user_id] = panel
            else:
                # Keep the latest complete keyboard while preserving pending role choices.
                available, _ = self._read_search_roles(current_markup)
                if available:
                    panel.markup = current_markup
                    panel.available_roles = available

            if kind == "all":
                panel.searching_roles = set(panel.available_roles)
            elif kind == "toggle" and role in panel.available_roles:
                if role in panel.searching_roles:
                    panel.searching_roles.remove(role)
                else:
                    panel.searching_roles.add(role)

            updated_markup = self._make_search_markup(panel)
            try:
                await self.bot.edit_message_reply_markup(
                    chat_id=chat_id,
                    message_id=message_id,
                    reply_markup=updated_markup,
                )
            except TelegramBadRequest as error:
                if "message is not modified" not in str(error).lower():
                    logger.info(
                        "Could not update party search buttons immediately for user %s: %s",
                        telegram_user_id,
                        error,
                    )
            except TelegramAPIError:
                logger.info(
                    "Could not update party search buttons immediately for user %s",
                    telegram_user_id,
                    exc_info=True,
                )

    @staticmethod
    def _read_search_roles(markup: InlineKeyboardMarkup) -> tuple[set[str], set[str]]:
        available: set[str] = set()
        searching: set[str] = set()
        prefix = "party:toggle-search:"
        for row in markup.inline_keyboard:
            for button in row:
                data = button.callback_data or ""
                if not data.startswith(prefix):
                    continue
                role = data.removeprefix(prefix)
                if role not in ROLES:
                    continue
                available.add(role)
                if button.text == "Ищем…":
                    searching.add(role)
        return available, searching

    @staticmethod
    def _make_search_markup(panel: OptimisticPartyPanel) -> InlineKeyboardMarkup:
        rows = []
        for row in panel.markup.inline_keyboard:
            if any(button.callback_data == "party:search-all" for button in row):
                continue
            updated_row = []
            for button in row:
                data = button.callback_data or ""
                if data.startswith("party:toggle-search:"):
                    role = data.removeprefix("party:toggle-search:")
                    label = "Ищем…" if role in panel.searching_roles else "Искать"
                    updated_row.append(button.model_copy(update={"text": label}))
                else:
                    updated_row.append(button)
            rows.append(updated_row)

        if panel.available_roles - panel.searching_roles:
            rows.insert(
                min(2, len(rows)),
                [InlineKeyboardButton(
                    text="🔎 Искать на всех свободных",
                    callback_data="party:search-all",
                )],
            )
        return panel.markup.model_copy(update={"inline_keyboard": rows})

    async def close(self) -> None:
        self._closed = True
        workers = list(self._workers.values())
        if workers:
            await asyncio.gather(*workers, return_exceptions=True)
        if self._reminders:
            await asyncio.gather(*self._reminders, return_exceptions=True)

    async def _drain(self, telegram_user_id: int) -> None:
        try:
            while True:
                await asyncio.sleep(BURST_WINDOW_SECONDS)
                actions = self._pending.pop(telegram_user_id, [])
                if not actions:
                    return

                chat_id = actions[-1].chat_id
                try:
                    screen, should_remind = await self._apply_actions(
                        telegram_user_id, actions
                    )
                except ApiError as error:
                    logger.warning(
                        "Could not apply queued party search for user %s: %s",
                        telegram_user_id,
                        error,
                    )
                    screen, should_remind = "party", False
                    await self._send_error(telegram_user_id, chat_id)
                except Exception:
                    logger.exception(
                        "Queued party search failed for user %s", telegram_user_id
                    )
                    screen, should_remind = "party", False
                    await self._send_error(telegram_user_id, chat_id)

                if should_remind:
                    self._schedule_dota_id_reminder(telegram_user_id, chat_id)

                # A newer burst should be applied before spending time rebuilding the card.
                if self._pending.get(telegram_user_id):
                    continue
                try:
                    lock = self._panel_locks.setdefault(
                        telegram_user_id, asyncio.Lock()
                    )
                    async with lock:
                        await edit_panel(
                            self.bot,
                            self.storage,
                            self.api,
                            self.settings,
                            telegram_user_id,
                            screen,
                            chat_id,
                        )
                        if not self._pending.get(telegram_user_id):
                            self._optimistic_panels.pop(telegram_user_id, None)
                except Exception:
                    logger.exception(
                        "Could not refresh queued party panel for user %s",
                        telegram_user_id,
                    )
                if not self._pending.get(telegram_user_id):
                    return
        finally:
            self._workers.pop(telegram_user_id, None)
            if self._pending.get(telegram_user_id) and not self._closed:
                self._workers[telegram_user_id] = asyncio.create_task(
                    self._drain(telegram_user_id)
                )

    async def _apply_actions(
        self,
        telegram_user_id: int,
        actions: list[PartySearchAction],
    ) -> tuple[str, bool]:
        response = await self.api.user(
            telegram_user_id, "GET", "/social/parties/me"
        )
        party = response.get("party") or (response.get("parties") or [None])[-1]
        if not party:
            self.storage.set_choices(telegram_user_id, "auto_search", [])
            self.storage.clear_search_timer(telegram_user_id)
            self.match_wakeup.set()
            return "home", False
        if not party.get("canManageParty"):
            return "party", False

        occupied_roles = {
            str(member.get("positionRole"))
            for member in party.get("members", [])
            if member.get("positionRole")
        }
        available_roles = ROLES - occupied_roles
        current_roles = set(map(str, party.get("recruitedRoles") or [])) & available_roles
        roles = set(current_roles)
        for action in actions:
            if action.kind == "all":
                roles = set(available_roles)
            elif action.kind == "toggle" and action.role in available_roles:
                if action.role in roles:
                    roles.remove(action.role)
                else:
                    roles.add(action.role)

        if roles != current_roles:
            slug = quote(str(party["slug"]), safe="")
            if roles and party.get("joinMode") != "OPEN":
                await self.api.user(
                    telegram_user_id,
                    "PATCH",
                    f"/social/parties/{slug}/join-mode",
                    {"joinMode": "OPEN"},
                )
            await self.api.user(
                telegram_user_id,
                "POST",
                "/dota/profiles/lfg/looking",
                {
                    "looking": bool(roles),
                    "partySlug": party["slug"],
                    "source": "telegram",
                    **({"recruitedRoles": sorted(roles)} if roles else {}),
                },
            )

            was_searching = bool(current_roles)
            if roles:
                previous_search = self.storage.get_choice(
                    telegram_user_id, "auto_search", 0
                ) or {}
                started_at = (
                    previous_search.get("startedAt")
                    if was_searching
                    and previous_search.get("mode") == "recruit"
                    and previous_search.get("partySlug") == party["slug"]
                    else time.time()
                )
                self.storage.set_choices(
                    telegram_user_id,
                    "auto_search",
                    [{
                        "mode": "recruit",
                        "partySlug": party["slug"],
                        "roles": sorted(roles),
                        "startedAt": started_at,
                    }],
                )
                if not was_searching:
                    self.storage.record_search_started(telegram_user_id)
                    self.storage.clear_auto_match_exclusions(telegram_user_id)
            else:
                self.storage.set_choices(telegram_user_id, "auto_search", [])
                self.storage.clear_search_timer(telegram_user_id)
            self.match_wakeup.set()
            return "party", bool(roles) and not was_searching

        return "party", False

    async def _send_error(self, telegram_user_id: int, chat_id: int) -> None:
        try:
            message = await self.bot.send_message(
                chat_id,
                "Не удалось обновить поиск. Попробуйте нажать ещё раз.",
            )
            self.storage.add_temporary_message(
                telegram_user_id, message.chat.id, message.message_id, 10
            )
        except TelegramAPIError:
            logger.info(
                "Could not send queued party search error to user %s",
                telegram_user_id,
                exc_info=True,
            )

    def _schedule_dota_id_reminder(self, telegram_user_id: int, chat_id: int) -> None:
        task = asyncio.create_task(self._send_dota_id_reminder(telegram_user_id, chat_id))
        self._reminders.add(task)
        task.add_done_callback(self._reminders.discard)

    async def _send_dota_id_reminder(
        self,
        telegram_user_id: int,
        chat_id: int,
    ) -> None:
        try:
            profile = await self.api.user(
                telegram_user_id, "GET", "/dota/profiles/me"
            )
            if profile.get("dotaAccountId"):
                return
            from ..handlers.search import send_dota_id_reminder

            await send_dota_id_reminder(
                self.bot,
                self.storage,
                telegram_user_id,
                chat_id,
            )
        except ApiError:
            return
