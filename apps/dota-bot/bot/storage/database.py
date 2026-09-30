from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
import json
from pathlib import Path
import sqlite3
from threading import RLock

from cryptography.fernet import Fernet


@dataclass(frozen=True)
class Session:
    access_token: str
    refresh_token: str
    recovery_url: str | None


@dataclass(frozen=True)
class Panel:
    chat_id: int
    message_id: int
    screen: str
    is_photo: bool


class BotStorage:
    def __init__(self, database_path: str, encryption_key: bytes) -> None:
        self.database_path = database_path
        self.cipher = Fernet(encryption_key)
        self.lock = RLock()
        self.connection: sqlite3.Connection | None = None

    def initialize(self) -> None:
        Path(self.database_path).parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(self.database_path, check_same_thread=False)
        self.connection.row_factory = sqlite3.Row
        self.connection.execute("PRAGMA journal_mode=WAL")
        self.connection.execute("PRAGMA foreign_keys=ON")
        self.connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS telegram_sessions (
              telegram_user_id INTEGER PRIMARY KEY,
              access_token BLOB NOT NULL,
              refresh_token BLOB NOT NULL,
              recovery_url BLOB,
              updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS bot_panels (
              telegram_user_id INTEGER PRIMARY KEY,
              chat_id INTEGER NOT NULL,
              message_id INTEGER NOT NULL,
              screen TEXT NOT NULL,
              media_type TEXT NOT NULL DEFAULT 'photo',
              updated_at TEXT NOT NULL,
              last_panel_bumped_at TEXT
            );
            CREATE TABLE IF NOT EXISTS callback_choices (
              telegram_user_id INTEGER NOT NULL,
              kind TEXT NOT NULL,
              items_json TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              PRIMARY KEY (telegram_user_id, kind)
            );
            CREATE TABLE IF NOT EXISTS temporary_messages (
              telegram_user_id INTEGER NOT NULL,
              chat_id INTEGER NOT NULL,
              message_id INTEGER NOT NULL,
              delete_at TEXT NOT NULL,
              PRIMARY KEY (chat_id, message_id)
            );
            CREATE TABLE IF NOT EXISTS delivered_notifications (
              notification_id TEXT PRIMARY KEY,
              delivered_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS auto_match_exclusions (
              telegram_user_id INTEGER NOT NULL,
              target_slug TEXT NOT NULL,
              created_at TEXT NOT NULL,
              PRIMARY KEY (telegram_user_id, target_slug)
            );
            CREATE TABLE IF NOT EXISTS bot_users (
              telegram_user_id INTEGER PRIMARY KEY,
              first_seen_at TEXT NOT NULL,
              last_seen_at TEXT NOT NULL,
              announcements_enabled INTEGER NOT NULL DEFAULT 1,
              blocked_at TEXT,
              acquisition_source TEXT NOT NULL DEFAULT 'existing',
              last_party_notification_at TEXT
            );
            CREATE TABLE IF NOT EXISTS bot_funnel_events (
              telegram_user_id INTEGER NOT NULL,
              event_type TEXT NOT NULL,
              occurred_at TEXT NOT NULL,
              PRIMARY KEY (telegram_user_id, event_type)
            );
            CREATE TABLE IF NOT EXISTS bot_schedules (
              schedule_key TEXT PRIMARY KEY,
              next_run_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS broadcast_campaigns (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              admin_user_id INTEGER NOT NULL,
              text TEXT NOT NULL,
              status TEXT NOT NULL,
              created_at TEXT NOT NULL,
              completed_at TEXT
            );
            CREATE TABLE IF NOT EXISTS broadcast_recipients (
              campaign_id INTEGER NOT NULL REFERENCES broadcast_campaigns(id) ON DELETE CASCADE,
              telegram_user_id INTEGER NOT NULL,
              status TEXT NOT NULL DEFAULT 'pending',
              attempts INTEGER NOT NULL DEFAULT 0,
              last_error TEXT,
              sent_at TEXT,
              PRIMARY KEY (campaign_id, telegram_user_id)
            );
            CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_pending
              ON broadcast_recipients (campaign_id, status, telegram_user_id);
            CREATE INDEX IF NOT EXISTS idx_bot_users_announcements
              ON bot_users (announcements_enabled, blocked_at);
            """
        )
        columns = {
            row["name"] for row in self.connection.execute("PRAGMA table_info(bot_panels)")
        }
        if "media_type" not in columns:
            self.connection.execute(
                "ALTER TABLE bot_panels ADD COLUMN media_type TEXT NOT NULL DEFAULT 'photo'"
            )
        if "last_panel_bumped_at" not in columns:
            self.connection.execute(
                "ALTER TABLE bot_panels ADD COLUMN last_panel_bumped_at TEXT"
            )
        self.connection.execute(
            "UPDATE bot_panels SET last_panel_bumped_at = ? WHERE last_panel_bumped_at IS NULL",
            (timestamp(),),
        )
        self.connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_bot_panels_position_refresh "
            "ON bot_panels (screen, last_panel_bumped_at)"
        )
        user_columns = {
            row["name"] for row in self.connection.execute("PRAGMA table_info(bot_users)")
        }
        if "acquisition_source" not in user_columns:
            self.connection.execute(
                "ALTER TABLE bot_users ADD COLUMN acquisition_source TEXT NOT NULL DEFAULT 'existing'"
            )
        if "last_party_notification_at" not in user_columns:
            self.connection.execute(
                "ALTER TABLE bot_users ADD COLUMN last_party_notification_at TEXT"
            )
        # Older installations already know users through their panel/session rows.
        # Backfill them so the first announcement reaches existing bot users too.
        self.connection.execute(
            """INSERT OR IGNORE INTO bot_users (telegram_user_id, first_seen_at, last_seen_at)
               SELECT telegram_user_id, updated_at, updated_at FROM bot_panels"""
        )
        self.connection.execute(
            """INSERT OR IGNORE INTO bot_users (telegram_user_id, first_seen_at, last_seen_at)
               SELECT telegram_user_id, updated_at, updated_at FROM telegram_sessions"""
        )
        # Preserve historical totals while keeping the new acquisition funnel honest:
        # old installs have no reliable source or event history.
        self.connection.execute(
            """INSERT OR IGNORE INTO bot_funnel_events (telegram_user_id, event_type, occurred_at)
               SELECT telegram_user_id, 'bot_started', first_seen_at FROM bot_users"""
        )
        self.connection.execute(
            """INSERT OR IGNORE INTO bot_funnel_events (telegram_user_id, event_type, occurred_at)
               SELECT telegram_user_id, 'account_ready', updated_at FROM telegram_sessions"""
        )
        self.connection.commit()

    def close(self) -> None:
        if self.connection is not None:
            self.connection.close()
            self.connection = None

    def save_session(
        self,
        telegram_user_id: int,
        access_token: str,
        refresh_token: str,
        recovery_url: str | None = None,
        *,
        clear_recovery_url: bool = False,
    ) -> None:
        connection = self._connection()
        with self.lock:
            connection.execute(
                """INSERT INTO telegram_sessions VALUES (?, ?, ?, ?, ?)
                   ON CONFLICT(telegram_user_id) DO UPDATE SET
                     access_token=excluded.access_token,
                     refresh_token=excluded.refresh_token,
                     recovery_url=CASE WHEN ? THEN NULL
                       ELSE COALESCE(excluded.recovery_url, telegram_sessions.recovery_url) END,
                     updated_at=excluded.updated_at""",
                (
                    telegram_user_id,
                    self._encrypt(access_token),
                    self._encrypt(refresh_token),
                    self._encrypt(recovery_url) if recovery_url else None,
                    timestamp(),
                    int(clear_recovery_url),
                ),
            )
            connection.commit()
        self.record_funnel_event(telegram_user_id, "account_ready")

    def get_session(self, telegram_user_id: int) -> Session | None:
        row = self._connection().execute(
            "SELECT access_token, refresh_token, recovery_url FROM telegram_sessions WHERE telegram_user_id = ?",
            (telegram_user_id,),
        ).fetchone()
        if row is None:
            return None
        return Session(
            access_token=self._decrypt(row["access_token"]),
            refresh_token=self._decrypt(row["refresh_token"]),
            recovery_url=self._decrypt(row["recovery_url"]) if row["recovery_url"] else None,
        )

    def session_user_ids(self) -> list[int]:
        rows = self._connection().execute(
            "SELECT telegram_user_id FROM telegram_sessions"
        ).fetchall()
        return [int(row["telegram_user_id"]) for row in rows]

    def record_bot_user(
        self, telegram_user_id: int, acquisition_source: str = "direct"
    ) -> None:
        now = timestamp()
        allowed_sources = {"seo", "community", "party_invite", "direct"}
        source = acquisition_source if acquisition_source in allowed_sources else "direct"
        with self.lock:
            connection = self._connection()
            inserted = connection.execute(
                """INSERT OR IGNORE INTO bot_users
                     (telegram_user_id, first_seen_at, last_seen_at, acquisition_source)
                   VALUES (?, ?, ?, ?)""",
                (telegram_user_id, now, now, source),
            ).rowcount
            connection.execute(
                """UPDATE bot_users SET last_seen_at = ?, blocked_at = NULL
                   WHERE telegram_user_id = ?""",
                (now, telegram_user_id),
            )
            if inserted:
                connection.execute(
                    """INSERT OR IGNORE INTO bot_funnel_events
                         (telegram_user_id, event_type, occurred_at)
                       VALUES (?, 'bot_started', ?)""",
                    (telegram_user_id, now),
                )
            connection.commit()

    def record_funnel_event(self, telegram_user_id: int, event_type: str) -> None:
        if event_type not in {"account_ready", "search_started", "party_joined"}:
            raise ValueError("Unsupported bot funnel event")
        self.record_bot_user(telegram_user_id)
        with self.lock:
            self._connection().execute(
                """INSERT OR IGNORE INTO bot_funnel_events
                     (telegram_user_id, event_type, occurred_at)
                   VALUES (?, ?, ?)""",
                (telegram_user_id, event_type, timestamp()),
            )
            self._connection().commit()

    def bot_acquisition_stats(self) -> dict:
        connection = self._connection()
        source_rows = connection.execute(
            """SELECT acquisition_source, COUNT(*) AS total
               FROM bot_users GROUP BY acquisition_source"""
        ).fetchall()
        event_rows = connection.execute(
            """SELECT users.acquisition_source, events.event_type, COUNT(*) AS total
               FROM bot_funnel_events AS events
               JOIN bot_users AS users ON users.telegram_user_id = events.telegram_user_id
               GROUP BY users.acquisition_source, events.event_type"""
        ).fetchall()
        sources = {str(row["acquisition_source"]): int(row["total"]) for row in source_rows}
        funnel: dict[str, dict[str, int]] = {}
        for row in event_rows:
            source = str(row["acquisition_source"])
            funnel.setdefault(source, {})[str(row["event_type"])] = int(row["total"])
        return {"sources": sources, "funnel": funnel}

    def set_announcements_enabled(self, telegram_user_id: int, enabled: bool) -> None:
        self.record_bot_user(telegram_user_id)
        with self.lock:
            self._connection().execute(
                "UPDATE bot_users SET announcements_enabled = ?, blocked_at = NULL WHERE telegram_user_id = ?",
                (int(enabled), telegram_user_id),
            )
            self._connection().commit()

    def announcements_enabled(self, telegram_user_id: int) -> bool:
        row = self._connection().execute(
            "SELECT announcements_enabled FROM bot_users WHERE telegram_user_id = ?",
            (telegram_user_id,),
        ).fetchone()
        return bool(row["announcements_enabled"]) if row else True

    def mark_bot_user_blocked(self, telegram_user_id: int) -> None:
        with self.lock:
            self._connection().execute(
                "UPDATE bot_users SET blocked_at = ? WHERE telegram_user_id = ?",
                (timestamp(), telegram_user_id),
            )
            self._connection().commit()

    def bot_user_stats(self) -> dict[str, int]:
        row = self._connection().execute(
            """SELECT COUNT(*) AS total,
                      SUM(CASE WHEN announcements_enabled = 1 AND blocked_at IS NULL THEN 1 ELSE 0 END) AS subscribers
               FROM bot_users"""
        ).fetchone()
        registered = self._connection().execute("SELECT COUNT(*) FROM telegram_sessions").fetchone()[0]
        return {
            "total": int(row["total"] or 0),
            "subscribers": int(row["subscribers"] or 0),
            "registered": int(registered or 0),
        }

    def create_broadcast(self, admin_user_id: int, text: str) -> tuple[int, int]:
        with self.lock:
            connection = self._connection()
            cursor = connection.execute(
                "INSERT INTO broadcast_campaigns (admin_user_id, text, status, created_at) VALUES (?, ?, 'queued', ?)",
                (admin_user_id, text, timestamp()),
            )
            campaign_id = int(cursor.lastrowid)
            recipients = connection.execute(
                "SELECT telegram_user_id FROM bot_users WHERE announcements_enabled = 1 AND blocked_at IS NULL"
            ).fetchall()
            connection.executemany(
                "INSERT INTO broadcast_recipients (campaign_id, telegram_user_id) VALUES (?, ?)",
                [(campaign_id, int(row["telegram_user_id"])) for row in recipients],
            )
            if not recipients:
                connection.execute(
                    "UPDATE broadcast_campaigns SET status = 'completed', completed_at = ? WHERE id = ?",
                    (timestamp(), campaign_id),
                )
            connection.commit()
            return campaign_id, len(recipients)

    def next_broadcast_recipient(self) -> dict | None:
        with self.lock:
            connection = self._connection()
            campaign = connection.execute(
                "SELECT id, admin_user_id, text FROM broadcast_campaigns WHERE status IN ('queued', 'sending') ORDER BY id LIMIT 1"
            ).fetchone()
            if campaign is None:
                return None
            recipient = connection.execute(
                """SELECT telegram_user_id FROM broadcast_recipients
                   WHERE campaign_id = ? AND status = 'pending' ORDER BY telegram_user_id LIMIT 1""",
                (campaign["id"],),
            ).fetchone()
            if recipient is None:
                connection.execute(
                    "UPDATE broadcast_campaigns SET status = 'completed', completed_at = ? WHERE id = ?",
                    (timestamp(), campaign["id"]),
                )
                connection.commit()
                return None
            connection.execute(
                "UPDATE broadcast_campaigns SET status = 'sending' WHERE id = ?",
                (campaign["id"],),
            )
            connection.commit()
            return {
                "campaign_id": int(campaign["id"]),
                "admin_user_id": int(campaign["admin_user_id"]),
                "text": str(campaign["text"]),
                "telegram_user_id": int(recipient["telegram_user_id"]),
            }

    def mark_broadcast_recipient(
        self,
        campaign_id: int,
        telegram_user_id: int,
        status: str,
        error: str | None = None,
        *,
        increment_attempt: bool = True,
    ) -> bool:
        if status not in {"sent", "blocked", "failed", "skipped"}:
            raise ValueError("Unsupported broadcast recipient status")
        now = timestamp()
        attempt_update = "attempts = attempts + 1," if increment_attempt else ""
        with self.lock:
            connection = self._connection()
            connection.execute(
                f"""UPDATE broadcast_recipients SET status = ?, {attempt_update}
                   last_error = ?, sent_at = CASE WHEN ? = 'sent' THEN ? ELSE sent_at END
                   WHERE campaign_id = ? AND telegram_user_id = ?""",
                (status, error, status, now, campaign_id, telegram_user_id),
            )
            if status == "blocked":
                connection.execute(
                    "UPDATE bot_users SET announcements_enabled = 0, blocked_at = ? WHERE telegram_user_id = ?",
                    (now, telegram_user_id),
                )
            pending = connection.execute(
                "SELECT 1 FROM broadcast_recipients WHERE campaign_id = ? AND status = 'pending' LIMIT 1",
                (campaign_id,),
            ).fetchone()
            completed = pending is None
            if completed:
                connection.execute(
                    "UPDATE broadcast_campaigns SET status = 'completed', completed_at = ? WHERE id = ?",
                    (now, campaign_id),
                )
            connection.commit()
            return completed

    def retry_broadcast_recipient(self, campaign_id: int, telegram_user_id: int, error: str) -> int:
        with self.lock:
            connection = self._connection()
            connection.execute(
                """UPDATE broadcast_recipients SET attempts = attempts + 1, last_error = ?
                   WHERE campaign_id = ? AND telegram_user_id = ? AND status = 'pending'""",
                (error[:500], campaign_id, telegram_user_id),
            )
            attempts = connection.execute(
                "SELECT attempts FROM broadcast_recipients WHERE campaign_id = ? AND telegram_user_id = ?",
                (campaign_id, telegram_user_id),
            ).fetchone()
            connection.commit()
            return int(attempts["attempts"] if attempts else 0)

    def broadcast_summary(self, campaign_id: int | None = None) -> dict | None:
        if campaign_id is None:
            campaign = self._connection().execute(
                "SELECT id, status, created_at FROM broadcast_campaigns ORDER BY id DESC LIMIT 1"
            ).fetchone()
        else:
            campaign = self._connection().execute(
                "SELECT id, status, created_at FROM broadcast_campaigns WHERE id = ?",
                (campaign_id,),
            ).fetchone()
        if campaign is None:
            return None
        counts = self._connection().execute(
            """SELECT COUNT(*) AS total,
                      SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
                      SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) AS blocked,
                      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
                      SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) AS skipped,
                      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending
               FROM broadcast_recipients WHERE campaign_id = ?""",
            (campaign["id"],),
        ).fetchone()
        return {
            "id": int(campaign["id"]),
            "status": str(campaign["status"]),
            "created_at": str(campaign["created_at"]),
            "total": int(counts["total"] or 0),
            "sent": int(counts["sent"] or 0),
            "blocked": int(counts["blocked"] or 0),
            "failed": int(counts["failed"] or 0),
            "skipped": int(counts["skipped"] or 0),
            "pending": int(counts["pending"] or 0),
        }

    def unlink(self, telegram_user_id: int) -> None:
        with self.lock:
            self._connection().execute(
                "DELETE FROM telegram_sessions WHERE telegram_user_id = ?", (telegram_user_id,)
            )
            self._connection().commit()

    def save_panel(
        self, telegram_user_id: int, chat_id: int, message_id: int, screen: str, is_photo: bool = True
    ) -> None:
        now = timestamp()
        with self.lock:
            self._connection().execute(
                """INSERT INTO bot_panels
                     (telegram_user_id, chat_id, message_id, screen, media_type, updated_at, last_panel_bumped_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(telegram_user_id) DO UPDATE SET
                     chat_id=excluded.chat_id, message_id=excluded.message_id,
                     screen=excluded.screen, media_type=excluded.media_type,
                     updated_at=excluded.updated_at,
                     last_panel_bumped_at=CASE
                       WHEN bot_panels.chat_id != excluded.chat_id
                         OR bot_panels.message_id != excluded.message_id
                       THEN excluded.last_panel_bumped_at
                       ELSE bot_panels.last_panel_bumped_at END""",
                (telegram_user_id, chat_id, message_id, screen, "photo" if is_photo else "text", now, now),
            )
            self._connection().commit()

    def due_panel_refresh_user_ids(
        self, scheduled_at: datetime, allowed_screens: tuple[str, ...]
    ) -> list[int]:
        rows = self._panel_refresh_rows(scheduled_at, allowed_screens)
        return [int(row["telegram_user_id"]) for row in rows]

    def panel_refresh_is_due(
        self,
        telegram_user_id: int,
        scheduled_at: datetime,
        allowed_screens: tuple[str, ...],
    ) -> bool:
        return bool(
            self._panel_refresh_rows(
                scheduled_at,
                allowed_screens,
                telegram_user_id,
                limit=1,
            )
        )

    def _panel_refresh_rows(
        self,
        scheduled_at: datetime,
        allowed_screens: tuple[str, ...],
        telegram_user_id: int | None = None,
        *,
        limit: int | None = None,
    ) -> list[sqlite3.Row]:
        if not allowed_screens:
            return []
        cutoff = scheduled_at.astimezone(UTC).isoformat()
        screen_params = ", ".join("?" for _ in allowed_screens)
        query = f"""SELECT panels.telegram_user_id
                    FROM bot_panels AS panels
                    JOIN bot_users AS users
                      ON users.telegram_user_id = panels.telegram_user_id
                    WHERE panels.screen IN ({screen_params})
                      AND panels.last_panel_bumped_at < ?
                      AND users.blocked_at IS NULL"""
        parameters: list[object] = [*allowed_screens, cutoff]
        if telegram_user_id is not None:
            query += " AND panels.telegram_user_id = ?"
            parameters.append(telegram_user_id)
        query += " ORDER BY panels.last_panel_bumped_at"
        if limit is not None:
            query += " LIMIT ?"
            parameters.append(limit)
        return self._connection().execute(query, parameters).fetchall()

    def get_or_create_panel_refresh_schedule(self, first_run_at: datetime) -> datetime:
        normalized_first_run = first_run_at.astimezone(UTC)
        with self.lock:
            connection = self._connection()
            connection.execute(
                "INSERT OR IGNORE INTO bot_schedules (schedule_key, next_run_at) VALUES (?, ?)",
                ("panel_position_refresh", normalized_first_run.isoformat()),
            )
            connection.commit()
            row = connection.execute(
                "SELECT next_run_at FROM bot_schedules WHERE schedule_key = ?",
                ("panel_position_refresh",),
            ).fetchone()
            return datetime.fromisoformat(row["next_run_at"])

    def advance_panel_refresh_schedule(
        self, expected_run_at: datetime, next_run_at: datetime
    ) -> bool:
        expected = expected_run_at.astimezone(UTC).isoformat()
        following = next_run_at.astimezone(UTC).isoformat()
        with self.lock:
            cursor = self._connection().execute(
                "UPDATE bot_schedules SET next_run_at = ? "
                "WHERE schedule_key = ? AND next_run_at = ?",
                (following, "panel_position_refresh", expected),
            )
            self._connection().commit()
            return cursor.rowcount == 1

    def record_party_notification(self, telegram_user_id: int) -> None:
        now = timestamp()
        with self.lock:
            connection = self._connection()
            connection.execute(
                """INSERT OR IGNORE INTO bot_users
                     (telegram_user_id, first_seen_at, last_seen_at, last_party_notification_at)
                   VALUES (?, ?, ?, ?)""",
                (telegram_user_id, now, now, now),
            )
            connection.execute(
                "UPDATE bot_users SET last_party_notification_at = ? WHERE telegram_user_id = ?",
                (now, telegram_user_id),
            )
            connection.commit()

    def get_panel(self, telegram_user_id: int) -> Panel | None:
        row = self._connection().execute(
            "SELECT chat_id, message_id, screen, media_type FROM bot_panels WHERE telegram_user_id = ?",
            (telegram_user_id,),
        ).fetchone()
        return Panel(row["chat_id"], row["message_id"], row["screen"], row["media_type"] == "photo") if row else None

    def set_choices(self, telegram_user_id: int, kind: str, items: list[dict]) -> None:
        with self.lock:
            self._connection().execute(
                """INSERT INTO callback_choices VALUES (?, ?, ?, ?)
                   ON CONFLICT(telegram_user_id, kind) DO UPDATE SET
                     items_json=excluded.items_json, updated_at=excluded.updated_at""",
                (telegram_user_id, kind, json.dumps(items), timestamp()),
            )
            self._connection().commit()

    def get_choice(self, telegram_user_id: int, kind: str, index: int) -> dict | None:
        row = self._connection().execute(
            "SELECT items_json FROM callback_choices WHERE telegram_user_id = ? AND kind = ?",
            (telegram_user_id, kind),
        ).fetchone()
        if row is None:
            return None
        try:
            items = json.loads(row["items_json"])
            return items[index] if 0 <= index < len(items) else None
        except (IndexError, TypeError, json.JSONDecodeError):
            return None

    def add_temporary_message(
        self, telegram_user_id: int, chat_id: int, message_id: int, ttl_seconds: int
    ) -> None:
        delete_at = datetime.now(UTC) + timedelta(seconds=ttl_seconds)
        with self.lock:
            self._connection().execute(
                "INSERT OR REPLACE INTO temporary_messages VALUES (?, ?, ?, ?)",
                (telegram_user_id, chat_id, message_id, delete_at.isoformat()),
            )
            self._connection().commit()

    def due_temporary_messages(self) -> list[tuple[int, int, int]]:
        rows = self._connection().execute(
            "SELECT telegram_user_id, chat_id, message_id FROM temporary_messages WHERE delete_at <= ?",
            (timestamp(),),
        ).fetchall()
        return [(row["telegram_user_id"], row["chat_id"], row["message_id"]) for row in rows]

    def remove_temporary_message(self, chat_id: int, message_id: int) -> None:
        with self.lock:
            self._connection().execute(
                "DELETE FROM temporary_messages WHERE chat_id = ? AND message_id = ?",
                (chat_id, message_id),
            )
            self._connection().commit()

    def is_temporary_message(self, chat_id: int, message_id: int) -> bool:
        return self._connection().execute(
            "SELECT 1 FROM temporary_messages WHERE chat_id = ? AND message_id = ?",
            (chat_id, message_id),
        ).fetchone() is not None

    def has_delivered_notification(self, notification_id: str) -> bool:
        return self._connection().execute(
            "SELECT 1 FROM delivered_notifications WHERE notification_id = ?",
            (notification_id,),
        ).fetchone() is not None

    def remember_delivered_notification(self, notification_id: str) -> None:
        with self.lock:
            self._connection().execute(
                "INSERT OR IGNORE INTO delivered_notifications VALUES (?, ?)",
                (notification_id, timestamp()),
            )
            self._connection().commit()

    def auto_match_exclusions(self, telegram_user_id: int) -> set[str]:
        rows = self._connection().execute(
            "SELECT target_slug FROM auto_match_exclusions WHERE telegram_user_id = ?",
            (telegram_user_id,),
        ).fetchall()
        return {str(row["target_slug"]) for row in rows}

    def exclude_auto_match_target(self, telegram_user_id: int, target_slug: str) -> None:
        with self.lock:
            self._connection().execute(
                "INSERT OR IGNORE INTO auto_match_exclusions VALUES (?, ?, ?)",
                (telegram_user_id, target_slug, timestamp()),
            )
            self._connection().commit()

    def clear_auto_match_exclusions(self, telegram_user_id: int) -> None:
        with self.lock:
            self._connection().execute(
                "DELETE FROM auto_match_exclusions WHERE telegram_user_id = ?",
                (telegram_user_id,),
            )
            self._connection().commit()

    def _encrypt(self, value: str) -> bytes:
        return self.cipher.encrypt(value.encode("utf-8"))

    def _decrypt(self, value: bytes) -> str:
        return self.cipher.decrypt(value).decode("utf-8")

    def _connection(self) -> sqlite3.Connection:
        if self.connection is None:
            raise RuntimeError("BotStorage.initialize() must be called first")
        return self.connection


def timestamp() -> str:
    return datetime.now(UTC).isoformat()
