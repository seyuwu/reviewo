from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
import json
import sqlite3
from threading import Lock
from typing import Any


PREFERRED_CONTACT_VALUES = frozenset(
    {
        "telegram_username",
        "discord",
        "email",
        "other",
    }
)


@dataclass(frozen=True)
class IncomingUser:
    telegram_user_id: int
    username: str | None
    first_name: str | None


@dataclass(frozen=True)
class FlowUser:
    telegram_user_id: int
    username: str | None
    first_name: str | None
    source: str
    created_at: str
    last_reply_at: str | None
    reply_count: int
    last_template_id: str | None


@dataclass(frozen=True)
class FlowStats:
    users_total: int
    users_today: int
    dm_received: int
    dm_replied: int
    contact_added: int
    cooldown_skip: int
    rate_limit_skip: int
    contact_conversion: float
    last_reply_at: str | None
    last_10: list[tuple[int, str | None, str | None, str | None]]


class WelcomeFlowStorage:
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

        self._connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
              telegram_user_id INTEGER PRIMARY KEY,
              username TEXT,
              first_name TEXT,
              source TEXT NOT NULL DEFAULT 'organic',
              created_at TEXT NOT NULL,
              last_reply_at TEXT,
              reply_count INTEGER NOT NULL DEFAULT 0,
              last_template_id TEXT
            );

            CREATE TABLE IF NOT EXISTS user_contacts (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              telegram_user_id INTEGER NOT NULL,
              preferred_contact TEXT NOT NULL,
              value TEXT NOT NULL,
              confirmed INTEGER NOT NULL DEFAULT 1,
              created_at TEXT NOT NULL,
              FOREIGN KEY (telegram_user_id) REFERENCES users(telegram_user_id)
            );

            CREATE TABLE IF NOT EXISTS events (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              telegram_user_id INTEGER,
              event_type TEXT NOT NULL,
              created_at TEXT NOT NULL,
              meta TEXT,
              FOREIGN KEY (telegram_user_id) REFERENCES users(telegram_user_id)
            );

            CREATE TABLE IF NOT EXISTS deck_state (
              id INTEGER PRIMARY KEY CHECK (id = 1),
              order_json TEXT NOT NULL,
              cursor INTEGER NOT NULL DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS idx_events_type_created
              ON events(event_type, created_at);
            CREATE INDEX IF NOT EXISTS idx_users_created
              ON users(created_at);
            """
        )
        self._connection.commit()

    def close(self) -> None:
        if self._connection is not None:
            self._connection.close()
            self._connection = None

    def upsert_user(self, incoming: IncomingUser, source: str) -> FlowUser:
        connection = self._get_connection()
        now = current_timestamp()

        with self._lock:
            existing = connection.execute(
                "SELECT * FROM users WHERE telegram_user_id = ?",
                (incoming.telegram_user_id,),
            ).fetchone()

            if existing is not None:
                connection.execute(
                    """
                    UPDATE users
                    SET username = ?, first_name = ?
                    WHERE telegram_user_id = ?
                    """,
                    (incoming.username, incoming.first_name, incoming.telegram_user_id),
                )
                connection.commit()
                row = connection.execute(
                    "SELECT * FROM users WHERE telegram_user_id = ?",
                    (incoming.telegram_user_id,),
                ).fetchone()
                return row_to_user(row)

            connection.execute(
                """
                INSERT INTO users (
                  telegram_user_id, username, first_name, source, created_at,
                  last_reply_at, reply_count, last_template_id
                )
                VALUES (?, ?, ?, ?, ?, NULL, 0, NULL)
                """,
                (incoming.telegram_user_id, incoming.username, incoming.first_name, source, now),
            )
            connection.commit()
            row = connection.execute(
                "SELECT * FROM users WHERE telegram_user_id = ?",
                (incoming.telegram_user_id,),
            ).fetchone()
            return row_to_user(row)

    def get_user(self, telegram_user_id: int) -> FlowUser | None:
        row = self._get_connection().execute(
            "SELECT * FROM users WHERE telegram_user_id = ?",
            (telegram_user_id,),
        ).fetchone()

        if row is None:
            return None

        return row_to_user(row)

    def can_send_welcome(self, telegram_user_id: int, cooldown_days: int) -> bool:
        user = self.get_user(telegram_user_id)
        if user is None or user.last_reply_at is None:
            return True

        last = datetime.fromisoformat(user.last_reply_at)
        if last.tzinfo is None:
            last = last.replace(tzinfo=UTC)

        return datetime.now(UTC) - last >= timedelta(days=cooldown_days)

    def record_welcome(self, telegram_user_id: int, template_id: str) -> None:
        connection = self._get_connection()
        now = current_timestamp()

        with self._lock:
            connection.execute(
                """
                UPDATE users
                SET last_reply_at = ?,
                    reply_count = reply_count + 1,
                    last_template_id = ?
                WHERE telegram_user_id = ?
                """,
                (now, template_id, telegram_user_id),
            )
            connection.commit()

    def add_event(
        self,
        event_type: str,
        telegram_user_id: int | None = None,
        meta: dict[str, Any] | None = None,
    ) -> None:
        connection = self._get_connection()
        now = current_timestamp()
        meta_json = json.dumps(meta, ensure_ascii=False) if meta else None

        with self._lock:
            connection.execute(
                """
                INSERT INTO events (telegram_user_id, event_type, created_at, meta)
                VALUES (?, ?, ?, ?)
                """,
                (telegram_user_id, event_type, now, meta_json),
            )
            connection.commit()

    def add_contact(
        self,
        telegram_user_id: int,
        preferred_contact: str,
        value: str,
        confirmed: bool,
    ) -> None:
        if preferred_contact not in PREFERRED_CONTACT_VALUES:
            raise ValueError(f"Unsupported preferred_contact: {preferred_contact}")

        connection = self._get_connection()
        now = current_timestamp()

        with self._lock:
            connection.execute(
                """
                INSERT INTO user_contacts (
                  telegram_user_id, preferred_contact, value, confirmed, created_at
                )
                VALUES (?, ?, ?, ?, ?)
                """,
                (telegram_user_id, preferred_contact, value.strip(), int(confirmed), now),
            )
            connection.commit()

        self.add_event(
            "contact_added",
            telegram_user_id,
            {"preferred_contact": preferred_contact, "confirmed": confirmed},
        )

    def next_template_id(self, template_ids: list[str]) -> str:
        if not template_ids:
            raise RuntimeError("No welcome templates configured.")

        connection = self._get_connection()

        with self._lock:
            row = connection.execute("SELECT order_json, cursor FROM deck_state WHERE id = 1").fetchone()

            if row is None:
                order = shuffle_copy(template_ids)
                connection.execute(
                    "INSERT INTO deck_state (id, order_json, cursor) VALUES (1, ?, 0)",
                    (json.dumps(order),),
                )
                connection.commit()
                cursor = 0
            else:
                order = json.loads(row["order_json"])
                cursor = int(row["cursor"])
                known = set(template_ids)
                if set(order) != known or len(order) != len(template_ids):
                    order = shuffle_copy(template_ids)
                    cursor = 0

            if cursor >= len(order):
                order = shuffle_copy(template_ids)
                cursor = 0

            template_id = order[cursor]
            cursor += 1

            connection.execute(
                "UPDATE deck_state SET order_json = ?, cursor = ? WHERE id = 1",
                (json.dumps(order), cursor),
            )
            if row is None:
                pass
            connection.commit()

            return template_id

    def get_stats(self) -> FlowStats:
        connection = self._get_connection()
        today = datetime.now(UTC).date().isoformat()

        users_total = connection.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        users_today = connection.execute(
            "SELECT COUNT(*) FROM users WHERE substr(created_at, 1, 10) = ?",
            (today,),
        ).fetchone()[0]

        def count_event(event_type: str) -> int:
            return connection.execute(
                "SELECT COUNT(*) FROM events WHERE event_type = ?",
                (event_type,),
            ).fetchone()[0]

        dm_received = count_event("dm_received")
        dm_replied = count_event("dm_replied")
        contact_added = count_event("contact_added")
        cooldown_skip = count_event("cooldown_skip")
        rate_limit_skip = count_event("rate_limit_skip")
        contact_conversion = (contact_added / dm_replied) if dm_replied else 0.0

        last_reply_row = connection.execute(
            """
            SELECT last_reply_at
            FROM users
            WHERE last_reply_at IS NOT NULL
            ORDER BY last_reply_at DESC
            LIMIT 1
            """
        ).fetchone()

        last_10_rows = connection.execute(
            """
            SELECT telegram_user_id, username, last_template_id, last_reply_at
            FROM users
            WHERE last_reply_at IS NOT NULL
            ORDER BY last_reply_at DESC
            LIMIT 10
            """
        ).fetchall()

        return FlowStats(
            users_total=users_total,
            users_today=users_today,
            dm_received=dm_received,
            dm_replied=dm_replied,
            contact_added=contact_added,
            cooldown_skip=cooldown_skip,
            rate_limit_skip=rate_limit_skip,
            contact_conversion=contact_conversion,
            last_reply_at=last_reply_row["last_reply_at"] if last_reply_row else None,
            last_10=[
                (
                    row["telegram_user_id"],
                    row["username"],
                    row["last_template_id"],
                    row["last_reply_at"],
                )
                for row in last_10_rows
            ],
        )

    def _get_connection(self) -> sqlite3.Connection:
        if self._connection is None:
            raise RuntimeError("WelcomeFlowStorage.initialize() must be called before use.")

        return self._connection


def current_timestamp() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def shuffle_copy(values: list[str]) -> list[str]:
    import random

    order = list(values)
    random.shuffle(order)
    return order


def row_to_user(row: sqlite3.Row | None) -> FlowUser:
    if row is None:
        raise RuntimeError("Expected user row.")

    values: dict[str, Any] = dict(row)
    return FlowUser(
        telegram_user_id=values["telegram_user_id"],
        username=values["username"],
        first_name=values["first_name"],
        source=values["source"],
        created_at=values["created_at"],
        last_reply_at=values["last_reply_at"],
        reply_count=values["reply_count"],
        last_template_id=values["last_template_id"],
    )
