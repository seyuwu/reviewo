"""Move an old menu only while handling explicit private navigation."""

import asyncio
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
import math
import time
from weakref import WeakValueDictionary

PANEL_BIRTH_KEY = "panel_message_birth"
PANEL_REPOST_SECONDS = 3 * 86400


@dataclass
class PanelInteraction:
    user_id: int
    active: bool = True


_interaction: ContextVar[PanelInteraction | None] = ContextVar("panel_interaction", default=None)
_repost_locks: WeakValueDictionary = WeakValueDictionary()


class PanelPublicationLock(asyncio.Lock):
    """Keep a render generation alive only while its per-user lock is in use."""

    def __init__(self) -> None:
        super().__init__()
        self.revision = 0

    def begin_update(self) -> int:
        self.revision += 1
        return self.revision


@contextmanager
def private_panel_interaction(user_id):
    interaction = PanelInteraction(user_id)
    token = _interaction.set(interaction)
    try:
        yield
    finally:
        # Tasks spawned by a callback inherit context, but must not keep moving
        # the menu after the user's actual interaction has finished.
        interaction.active = False
        _interaction.reset(token)


def remember_legacy_panel_date(storage, user_id, message):
    panel = storage.get_panel(user_id)
    if not panel or panel.chat_id != message.chat.id or panel.message_id != message.message_id:
        return
    saved = storage.get_choice(user_id, PANEL_BIRTH_KEY, 0) or {}
    if saved.get("chatId") == panel.chat_id and saved.get("messageId") == panel.message_id:
        return
    date = getattr(message, "date", None)
    if not hasattr(date, "timestamp"):
        return
    sent_at = date.timestamp()
    if math.isfinite(sent_at) and 0 < sent_at <= time.time() + 60:
        storage.set_choices(user_id, PANEL_BIRTH_KEY, [{"chatId": panel.chat_id, "messageId": panel.message_id, "sentAt": sent_at}])


def panel_age(storage, user_id, panel):
    if not panel:
        return None
    saved = storage.get_choice(user_id, PANEL_BIRTH_KEY, 0) or {}
    if saved.get("chatId") != panel.chat_id or saved.get("messageId") != panel.message_id:
        return None
    try:
        sent_at = float(saved["sentAt"])
    except (KeyError, TypeError, ValueError, OverflowError):
        return None
    return max(0, time.time() - sent_at) if math.isfinite(sent_at) and sent_at > 0 else None


def panel_repost_due(storage, user_id):
    interaction = _interaction.get()
    if not interaction or not interaction.active or interaction.user_id != user_id:
        return False
    age = panel_age(storage, user_id, storage.get_panel(user_id))
    return age is not None and age >= PANEL_REPOST_SECONDS


def panel_repost_lock(user_id):
    lock = _repost_locks.get(user_id)
    if lock is None:
        lock = PanelPublicationLock()
        _repost_locks[user_id] = lock
    return lock
