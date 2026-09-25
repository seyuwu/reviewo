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
            """
        )
        columns = {
            row["name"] for row in self.connection.execute("PRAGMA table_info(bot_panels)")
        }
        if "media_type" not in columns:
            self.connection.execute(
                "ALTER TABLE bot_panels ADD COLUMN media_type TEXT NOT NULL DEFAULT 'photo'"
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

    def unlink(self, telegram_user_id: int) -> None:
        with self.lock:
            self._connection().execute(
                "DELETE FROM telegram_sessions WHERE telegram_user_id = ?", (telegram_user_id,)
            )
            self._connection().commit()

    def save_panel(
        self, telegram_user_id: int, chat_id: int, message_id: int, screen: str, is_photo: bool = True
    ) -> None:
        with self.lock:
            self._connection().execute(
                """INSERT INTO bot_panels (telegram_user_id, chat_id, message_id, screen, media_type, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT(telegram_user_id) DO UPDATE SET
                     chat_id=excluded.chat_id, message_id=excluded.message_id,
                     screen=excluded.screen, media_type=excluded.media_type,
                     updated_at=excluded.updated_at""",
                (telegram_user_id, chat_id, message_id, screen, "photo" if is_photo else "text", timestamp()),
            )
            self._connection().commit()

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
