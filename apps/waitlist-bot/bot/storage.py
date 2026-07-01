from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
import re
import sqlite3
from threading import Lock
from typing import Any


SOURCE_ALIASES = {
    "ig": "instagram",
    "inst": "instagram",
    "instagram": "instagram",
    "vk": "vk",
    "tg": "telegram",
    "telegram": "telegram",
    "x": "x",
    "twitter": "x",
    "landing": "landing",
    "site": "landing",
    "friend": "friend",
    "ref": "referral",
    "test": "test",
}


@dataclass(frozen=True)
class IncomingUser:
    telegram_user_id: int
    username: str | None
    first_name: str | None
    last_name: str | None
    language_code: str | None
    is_premium: bool


@dataclass(frozen=True)
class WaitlistUser:
    telegram_user_id: int
    username: str | None
    first_name: str | None
    last_name: str | None
    language_code: str | None
    source: str
    start_payload: str | None
    waitlist_number: int
    joined_at: str
    last_seen_at: str
    notifications_enabled: bool


@dataclass(frozen=True)
class WaitlistEntryResult:
    user: WaitlistUser
    created: bool


@dataclass(frozen=True)
class WaitlistStats:
    total: int
    joined_today: int
    notifications_enabled: int
    by_source: list[tuple[str, int]]


class WaitlistStorage:
    def __init__(self, database_path: str) -> None:
        self._database_path = database_path
        self._lock = Lock()
        self._connection: sqlite3.Connection | None = None

    def initialize(self) -> None:
        Path(self._database_path).parent.mkdir(parents=True, exist_ok=True)
        self._connection = sqlite3.connect(self._database_path, check_same_thread=False)
        self._connection.row_factory = sqlite3.Row
        self._connection.execute("PRAGMA journal_mode=WAL")
        self._connection.execute("PRAGMA foreign_keys=ON")
        self._connection.execute(
            """
            CREATE TABLE IF NOT EXISTS waitlist_users (
              telegram_user_id INTEGER PRIMARY KEY,
              username TEXT,
              first_name TEXT,
              last_name TEXT,
              language_code TEXT,
              is_premium INTEGER NOT NULL DEFAULT 0,
              source TEXT NOT NULL DEFAULT 'organic',
              start_payload TEXT,
              waitlist_number INTEGER NOT NULL UNIQUE,
              joined_at TEXT NOT NULL,
              last_seen_at TEXT NOT NULL,
              notifications_enabled INTEGER NOT NULL DEFAULT 1,
              stopped_at TEXT
            )
            """
        )
        self._connection.commit()

    def close(self) -> None:
        if self._connection is not None:
            self._connection.close()
            self._connection = None

    def upsert_user(self, incoming_user: IncomingUser, start_payload: str | None) -> WaitlistEntryResult:
        connection = self._get_connection()
        now = current_timestamp()
        normalized_payload = normalize_payload(start_payload)
        source = resolve_source(normalized_payload)

        with self._lock:
            existing = connection.execute(
                "SELECT * FROM waitlist_users WHERE telegram_user_id = ?",
                (incoming_user.telegram_user_id,),
            ).fetchone()

            if existing is not None:
                connection.execute(
                    """
                    UPDATE waitlist_users
                    SET username = ?,
                        first_name = ?,
                        last_name = ?,
                        language_code = ?,
                        is_premium = ?,
                        last_seen_at = ?,
                        notifications_enabled = 1
                    WHERE telegram_user_id = ?
                    """,
                    (
                        incoming_user.username,
                        incoming_user.first_name,
                        incoming_user.last_name,
                        incoming_user.language_code,
                        int(incoming_user.is_premium),
                        now,
                        incoming_user.telegram_user_id,
                    ),
                )
                connection.commit()
                updated = connection.execute(
                    "SELECT * FROM waitlist_users WHERE telegram_user_id = ?",
                    (incoming_user.telegram_user_id,),
                ).fetchone()
                return WaitlistEntryResult(user=row_to_waitlist_user(updated), created=False)

            next_number = (
                connection.execute("SELECT COALESCE(MAX(waitlist_number), 0) + 1 FROM waitlist_users").fetchone()[0]
            )
            connection.execute(
                """
                INSERT INTO waitlist_users (
                  telegram_user_id,
                  username,
                  first_name,
                  last_name,
                  language_code,
                  is_premium,
                  source,
                  start_payload,
                  waitlist_number,
                  joined_at,
                  last_seen_at,
                  notifications_enabled
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                """,
                (
                    incoming_user.telegram_user_id,
                    incoming_user.username,
                    incoming_user.first_name,
                    incoming_user.last_name,
                    incoming_user.language_code,
                    int(incoming_user.is_premium),
                    source,
                    normalized_payload,
                    next_number,
                    now,
                    now,
                ),
            )
            connection.commit()
            created = connection.execute(
                "SELECT * FROM waitlist_users WHERE telegram_user_id = ?",
                (incoming_user.telegram_user_id,),
            ).fetchone()
            return WaitlistEntryResult(user=row_to_waitlist_user(created), created=True)

    def get_user(self, telegram_user_id: int) -> WaitlistUser | None:
        row = self._get_connection().execute(
            "SELECT * FROM waitlist_users WHERE telegram_user_id = ?",
            (telegram_user_id,),
        ).fetchone()

        if row is None:
            return None

        return row_to_waitlist_user(row)

    def stop_notifications(self, telegram_user_id: int) -> WaitlistUser | None:
        connection = self._get_connection()
        now = current_timestamp()

        with self._lock:
            connection.execute(
                """
                UPDATE waitlist_users
                SET notifications_enabled = 0,
                    stopped_at = ?,
                    last_seen_at = ?
                WHERE telegram_user_id = ?
                """,
                (now, now, telegram_user_id),
            )
            connection.commit()

        return self.get_user(telegram_user_id)

    def get_stats(self) -> WaitlistStats:
        connection = self._get_connection()
        today = datetime.now(UTC).date().isoformat()
        total = connection.execute("SELECT COUNT(*) FROM waitlist_users").fetchone()[0]
        joined_today = connection.execute(
            "SELECT COUNT(*) FROM waitlist_users WHERE substr(joined_at, 1, 10) = ?",
            (today,),
        ).fetchone()[0]
        notifications_enabled = connection.execute(
            "SELECT COUNT(*) FROM waitlist_users WHERE notifications_enabled = 1"
        ).fetchone()[0]
        by_source_rows = connection.execute(
            """
            SELECT source, COUNT(*) AS count
            FROM waitlist_users
            GROUP BY source
            ORDER BY count DESC, source ASC
            LIMIT 10
            """
        ).fetchall()

        return WaitlistStats(
            total=total,
            joined_today=joined_today,
            notifications_enabled=notifications_enabled,
            by_source=[(row["source"], row["count"]) for row in by_source_rows],
        )

    def get_active_user_ids(self) -> list[int]:
        rows = self._get_connection().execute(
            """
            SELECT telegram_user_id
            FROM waitlist_users
            WHERE notifications_enabled = 1
            ORDER BY waitlist_number ASC
            """
        ).fetchall()

        return [row["telegram_user_id"] for row in rows]

    def _get_connection(self) -> sqlite3.Connection:
        if self._connection is None:
            raise RuntimeError("WaitlistStorage.initialize() must be called before use.")

        return self._connection


def current_timestamp() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def normalize_payload(start_payload: str | None) -> str | None:
    if start_payload is None:
        return None

    value = start_payload.strip()
    if not value:
        return None

    return value[:128]


def resolve_source(start_payload: str | None) -> str:
    if start_payload is None:
        return "organic"

    normalized = start_payload.lower()
    normalized = re.sub(r"[^a-z0-9_-]", "", normalized)

    if not normalized:
        return "organic"

    if normalized.startswith("ref_") or normalized.startswith("ref-"):
        return "referral"

    return SOURCE_ALIASES.get(normalized, "other")


def row_to_waitlist_user(row: sqlite3.Row | None) -> WaitlistUser:
    if row is None:
        raise RuntimeError("Expected waitlist user row.")

    values: dict[str, Any] = dict(row)

    return WaitlistUser(
        telegram_user_id=values["telegram_user_id"],
        username=values["username"],
        first_name=values["first_name"],
        last_name=values["last_name"],
        language_code=values["language_code"],
        source=values["source"],
        start_payload=values["start_payload"],
        waitlist_number=values["waitlist_number"],
        joined_at=values["joined_at"],
        last_seen_at=values["last_seen_at"],
        notifications_enabled=bool(values["notifications_enabled"]),
    )
