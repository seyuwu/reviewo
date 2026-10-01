import asyncio
import logging
import time
from dataclasses import dataclass
from urllib.parse import quote

from aiogram import Bot
from aiogram.exceptions import TelegramAPIError

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
        self._closed = False

    def enqueue(
        self,
        telegram_user_id: int,
        chat_id: int,
        kind: str,
        role: str | None = None,
    ) -> None:
        if self._closed:
            return
        self._pending.setdefault(telegram_user_id, []).append(
            PartySearchAction(kind=kind, chat_id=chat_id, role=role)
        )
        worker = self._workers.get(telegram_user_id)
        if worker is None or worker.done():
            self._workers[telegram_user_id] = asyncio.create_task(
                self._drain(telegram_user_id)
            )

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
                    await edit_panel(
                        self.bot,
                        self.storage,
                        self.api,
                        self.settings,
                        telegram_user_id,
                        screen,
                        chat_id,
                    )
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
