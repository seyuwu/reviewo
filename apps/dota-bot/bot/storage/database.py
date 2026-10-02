from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
import json
from pathlib import Path
import re
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
              updated_at TEXT NOT NULL
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
              acquisition_campaign TEXT,
              last_party_notification_at TEXT
            );
            CREATE TABLE IF NOT EXISTS bot_funnel_events (
              telegram_user_id INTEGER NOT NULL,
              event_type TEXT NOT NULL,
              occurred_at TEXT NOT NULL,
              PRIMARY KEY (telegram_user_id, event_type)
            );
            CREATE TABLE IF NOT EXISTS bot_activity_events (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              telegram_user_id INTEGER NOT NULL,
              event_type TEXT NOT NULL,
              occurred_at TEXT NOT NULL,
              duration_seconds INTEGER
            );
            CREATE INDEX IF NOT EXISTS idx_bot_activity_type_time
              ON bot_activity_events (event_type, occurred_at);
            CREATE TABLE IF NOT EXISTS active_search_timers (
              telegram_user_id INTEGER PRIMARY KEY,
              started_at TEXT NOT NULL
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
        user_columns = {
            row["name"] for row in self.connection.execute("PRAGMA table_info(bot_users)")
        }
        if "acquisition_source" not in user_columns:
            self.connection.execute(
                "ALTER TABLE bot_users ADD COLUMN acquisition_source TEXT NOT NULL DEFAULT 'existing'"
            )
        if "acquisition_campaign" not in user_columns:
            self.connection.execute(
                "ALTER TABLE bot_users ADD COLUMN acquisition_campaign TEXT"
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
        self,
        telegram_user_id: int,
        acquisition_source: str = "direct",
        acquisition_campaign: str | None = None,
    ) -> None:
        now = timestamp()
        allowed_sources = {
            "seo", "community", "telegram", "discord", "vk", "tiktok",
            "youtube", "twitch", "steam", "search", "referral", "streamer",
            "site", "other", "party_invite", "direct", "existing",
        }
        source = acquisition_source if acquisition_source in allowed_sources else "direct"
        campaign = self._campaign_code(acquisition_campaign)
        with self.lock:
            connection = self._connection()
            inserted = connection.execute(
                """INSERT OR IGNORE INTO bot_users
                     (telegram_user_id, first_seen_at, last_seen_at, acquisition_source,
                      acquisition_campaign)
                   VALUES (?, ?, ?, ?, ?)""",
                (telegram_user_id, now, now, source, campaign),
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
        if event_type not in {
            "account_ready",
            "search_started",
            "party_joined",
            "party_created",
        }:
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

    def record_party_created(self, telegram_user_id: int) -> None:
        self.record_funnel_event(telegram_user_id, "party_created")
        with self.lock:
            self._connection().execute(
                """INSERT INTO bot_activity_events
                     (telegram_user_id, event_type, occurred_at)
                   VALUES (?, 'party_created', ?)""",
                (telegram_user_id, timestamp()),
            )
            self._connection().commit()

    def record_search_started(self, telegram_user_id: int) -> None:
        """Record every successful search start and reset its time-to-party clock."""
        self.record_funnel_event(telegram_user_id, "search_started")
        now = timestamp()
        with self.lock:
            connection = self._connection()
            connection.execute(
                """INSERT INTO bot_activity_events
                     (telegram_user_id, event_type, occurred_at)
                   VALUES (?, 'search_started', ?)""",
                (telegram_user_id, now),
            )
            connection.execute(
                """INSERT INTO active_search_timers (telegram_user_id, started_at)
                   VALUES (?, ?)
                   ON CONFLICT(telegram_user_id) DO UPDATE SET started_at=excluded.started_at""",
                (telegram_user_id, now),
            )
            connection.commit()

    def record_party_joined(
        self,
        telegram_user_id: int,
        *,
        completes_search: bool = False,
        clear_search_timer: bool = False,
    ) -> None:
        """Record a party entry and optionally finish or clear the search timer."""
        self.record_funnel_event(telegram_user_id, "party_joined")
        now = timestamp()
        duration_seconds = None
        with self.lock:
            connection = self._connection()
            if completes_search:
                timer = connection.execute(
                    "SELECT started_at FROM active_search_timers WHERE telegram_user_id = ?",
                    (telegram_user_id,),
                ).fetchone()
                if timer:
                    try:
                        elapsed = int(
                            (
                                datetime.fromisoformat(now)
                                - datetime.fromisoformat(timer["started_at"])
                            ).total_seconds()
                        )
                        if 0 <= elapsed <= 30 * 24 * 60 * 60:
                            duration_seconds = elapsed
                    except (TypeError, ValueError):
                        duration_seconds = None
            if completes_search or clear_search_timer:
                connection.execute(
                    "DELETE FROM active_search_timers WHERE telegram_user_id = ?",
                    (telegram_user_id,),
                )
            connection.execute(
                """INSERT INTO bot_activity_events
                     (telegram_user_id, event_type, occurred_at, duration_seconds)
                   VALUES (?, 'party_joined', ?, ?)""",
                (telegram_user_id, now, duration_seconds),
            )
            if duration_seconds is not None:
                connection.execute(
                    """INSERT INTO bot_activity_events
                         (telegram_user_id, event_type, occurred_at, duration_seconds)
                       VALUES (?, 'search_result', ?, ?)""",
                    (telegram_user_id, now, duration_seconds),
                )
            connection.commit()

    def clear_search_timer(self, telegram_user_id: int) -> None:
        with self.lock:
            self._connection().execute(
                "DELETE FROM active_search_timers WHERE telegram_user_id = ?",
                (telegram_user_id,),
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
        recent_since = (datetime.now(UTC) - timedelta(days=30)).isoformat()
        campaign_rows = connection.execute(
            """SELECT acquisition_source, acquisition_campaign, COUNT(*) AS starts,
                      SUM(CASE WHEN first_seen_at >= ? THEN 1 ELSE 0 END) AS starts_30d
               FROM bot_users
               GROUP BY acquisition_source, acquisition_campaign
               ORDER BY starts_30d DESC, starts DESC, acquisition_source, acquisition_campaign""",
            (recent_since,),
        ).fetchall()
        campaign_funnel_rows = connection.execute(
            """SELECT users.acquisition_source, users.acquisition_campaign,
                      events.event_type, COUNT(*) AS total,
                      SUM(CASE WHEN events.occurred_at >= ? THEN 1 ELSE 0 END) AS total_30d
               FROM bot_funnel_events AS events
               JOIN bot_users AS users ON users.telegram_user_id = events.telegram_user_id
               GROUP BY users.acquisition_source, users.acquisition_campaign, events.event_type""",
            (recent_since,),
        ).fetchall()
        campaigns: dict[tuple[str, str | None], dict] = {
            (str(row["acquisition_source"]), row["acquisition_campaign"]): {
                "source": str(row["acquisition_source"]),
                "campaign": row["acquisition_campaign"],
                "starts": int(row["starts"]),
                "starts_30d": int(row["starts_30d"] or 0),
                "funnel": {},
                "funnel_30d": {},
                "search_events_30d": 0,
                "search_users_30d": 0,
                "party_events_30d": 0,
                "party_users_30d": 0,
                "search_party_events_30d": 0,
                "search_party_users_30d": 0,
                "party_created_30d": 0,
                "party_created_users_30d": 0,
                "search_party_duration_total_30d": 0,
                "search_party_duration_samples_30d": 0,
                "avg_seconds_to_party": None,
            }
            for row in campaign_rows
        }
        for row in campaign_funnel_rows:
            key = (str(row["acquisition_source"]), row["acquisition_campaign"])
            campaigns.setdefault(
                key,
                {
                    "source": key[0], "campaign": key[1], "starts": 0,
                    "starts_30d": 0, "funnel": {}, "funnel_30d": {},
                    "search_events_30d": 0, "search_users_30d": 0,
                    "party_events_30d": 0, "party_users_30d": 0,
                    "search_party_events_30d": 0, "search_party_users_30d": 0,
                    "party_created_30d": 0, "party_created_users_30d": 0,
                    "search_party_duration_total_30d": 0,
                    "search_party_duration_samples_30d": 0,
                    "avg_seconds_to_party": None,
                },
            )
            campaigns[key]["funnel"][str(row["event_type"])] = int(row["total"])
            campaigns[key]["funnel_30d"][str(row["event_type"])] = int(row["total_30d"] or 0)
        activity_rows = connection.execute(
            """SELECT users.acquisition_source, users.acquisition_campaign,
                      SUM(CASE WHEN events.event_type = 'search_started' THEN 1 ELSE 0 END)
                          AS searches_30d,
                      COUNT(DISTINCT CASE WHEN events.event_type = 'search_started'
                                          THEN events.telegram_user_id END) AS search_users_30d,
                      SUM(CASE WHEN events.event_type = 'party_joined' THEN 1 ELSE 0 END)
                          AS parties_30d,
                      COUNT(DISTINCT CASE WHEN events.event_type = 'party_joined'
                                          THEN events.telegram_user_id END) AS party_users_30d,
                      SUM(CASE WHEN events.event_type = 'search_result' THEN 1 ELSE 0 END)
                          AS search_party_events_30d,
                      COUNT(DISTINCT CASE WHEN events.event_type = 'search_result'
                                          THEN events.telegram_user_id END)
                          AS search_party_users_30d,
                      SUM(CASE WHEN events.event_type = 'party_created' THEN 1 ELSE 0 END)
                          AS party_creations_30d,
                      COUNT(DISTINCT CASE WHEN events.event_type = 'party_created'
                                          THEN events.telegram_user_id END)
                          AS party_created_users_30d,
                      SUM(CASE WHEN events.event_type = 'search_result'
                               THEN events.duration_seconds ELSE 0 END)
                          AS search_party_duration_total_30d,
                      COUNT(CASE WHEN events.event_type = 'search_result'
                                 THEN 1 END) AS search_party_duration_samples_30d,
                      AVG(CASE WHEN events.event_type = 'search_result'
                               THEN events.duration_seconds END) AS avg_seconds
               FROM bot_activity_events AS events
               JOIN bot_users AS users ON users.telegram_user_id = events.telegram_user_id
               WHERE events.occurred_at >= ?
               GROUP BY users.acquisition_source, users.acquisition_campaign""",
            (recent_since,),
        ).fetchall()
        for row in activity_rows:
            key = (str(row["acquisition_source"]), row["acquisition_campaign"])
            campaign = campaigns.setdefault(
                key,
                {
                    "source": key[0], "campaign": key[1], "starts": 0,
                    "starts_30d": 0, "funnel": {}, "funnel_30d": {},
                    "search_events_30d": 0, "search_users_30d": 0,
                    "party_events_30d": 0, "party_users_30d": 0,
                    "search_party_events_30d": 0, "search_party_users_30d": 0,
                    "party_created_30d": 0, "party_created_users_30d": 0,
                    "search_party_duration_total_30d": 0,
                    "search_party_duration_samples_30d": 0,
                    "avg_seconds_to_party": None,
                },
            )
            campaign["search_events_30d"] = int(row["searches_30d"] or 0)
            campaign["search_users_30d"] = int(row["search_users_30d"] or 0)
            campaign["party_events_30d"] = int(row["parties_30d"] or 0)
            campaign["party_users_30d"] = int(row["party_users_30d"] or 0)
            campaign["search_party_events_30d"] = int(row["search_party_events_30d"] or 0)
            campaign["search_party_users_30d"] = int(row["search_party_users_30d"] or 0)
            campaign["party_created_30d"] = int(row["party_creations_30d"] or 0)
            campaign["party_created_users_30d"] = int(row["party_created_users_30d"] or 0)
            campaign["search_party_duration_total_30d"] = int(
                row["search_party_duration_total_30d"] or 0
            )
            campaign["search_party_duration_samples_30d"] = int(
                row["search_party_duration_samples_30d"] or 0
            )
            average = row["avg_seconds"]
            campaign["avg_seconds_to_party"] = int(average) if average is not None else None
        return {"sources": sources, "funnel": funnel, "campaigns": list(campaigns.values())}

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
                     (telegram_user_id, chat_id, message_id, screen, media_type, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT(telegram_user_id) DO UPDATE SET
                     chat_id=excluded.chat_id, message_id=excluded.message_id,
                     screen=excluded.screen, media_type=excluded.media_type,
                     updated_at=excluded.updated_at""",
                (telegram_user_id, chat_id, message_id, screen, "photo" if is_photo else "text", now),
            )
            self._connection().commit()

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

    def has_short_lived_temporary_message(self, telegram_user_id: int) -> bool:
        cutoff = (datetime.now(UTC) + timedelta(seconds=30)).isoformat()
        return self._connection().execute(
            """SELECT 1 FROM temporary_messages
               WHERE telegram_user_id = ? AND delete_at <= ? LIMIT 1""",
            (telegram_user_id, cutoff),
        ).fetchone() is not None

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

    @staticmethod
    def _campaign_code(value: str | None) -> str | None:
        if not value:
            return None
        value = value.lower()
        if len(value) > 48 or not re.fullmatch(r"[a-z0-9_-]+", value):
            return None
        return value

    def _connection(self) -> sqlite3.Connection:
        if self.connection is None:
            raise RuntimeError("BotStorage.initialize() must be called first")
        return self.connection


def timestamp() -> str:
    return datetime.now(UTC).isoformat()
