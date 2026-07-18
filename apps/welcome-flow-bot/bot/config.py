from dataclasses import dataclass
from pathlib import Path
import os


DEFAULT_TEMPLATES_PATH = Path(__file__).resolve().parent.parent / "templates.json"


@dataclass(frozen=True)
class Settings:
    bot_token: str
    channel_url: str
    admin_ids: frozenset[int]
    database_path: str
    templates_path: Path
    delay_min_seconds: float
    delay_max_seconds: float
    cooldown_days: int
    hourly_cap: int
    max_template_len: int
    max_first_line_len: int


def load_settings() -> Settings:
    delay_min = parse_float("WELCOME_FLOW_DELAY_MIN", 6.0)
    delay_max = parse_float("WELCOME_FLOW_DELAY_MAX", 18.0)

    if delay_min < 0 or delay_max < delay_min:
        raise RuntimeError("WELCOME_FLOW_DELAY_MIN/MAX must satisfy 0 <= min <= max.")

    templates_raw = os.getenv("WELCOME_FLOW_TEMPLATES_PATH", "").strip()
    templates_path = Path(templates_raw) if templates_raw else DEFAULT_TEMPLATES_PATH

    return Settings(
        bot_token=get_required_env("WELCOME_FLOW_BOT_TOKEN"),
        channel_url=os.getenv("WELCOME_FLOW_CHANNEL_URL", "https://t.me/opiniagames").strip(),
        admin_ids=parse_admin_ids(os.getenv("WELCOME_FLOW_ADMIN_IDS", "")),
        database_path=os.getenv("WELCOME_FLOW_DATABASE_PATH", "/data/welcome_flow.db").strip()
        or "/data/welcome_flow.db",
        templates_path=templates_path,
        delay_min_seconds=delay_min,
        delay_max_seconds=delay_max,
        cooldown_days=parse_int("WELCOME_FLOW_COOLDOWN_DAYS", 30),
        hourly_cap=parse_int("WELCOME_FLOW_HOURLY_CAP", 40),
        max_template_len=350,
        max_first_line_len=60,
    )


def get_required_env(name: str) -> str:
    value = os.getenv(name, "").strip()

    if not value or value.startswith("change_me"):
        raise RuntimeError(f"{name} is required. Put it in your .env file before starting the bot.")

    return value


def parse_admin_ids(value: str) -> frozenset[int]:
    admin_ids: set[int] = set()

    for raw_item in value.split(","):
        item = raw_item.strip()
        if not item:
            continue

        try:
            admin_ids.add(int(item))
        except ValueError as error:
            raise RuntimeError(f"WELCOME_FLOW_ADMIN_IDS contains a non-numeric id: {item}") from error

    return frozenset(admin_ids)


def parse_int(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default

    try:
        return int(raw)
    except ValueError as error:
        raise RuntimeError(f"{name} must be an integer.") from error


def parse_float(name: str, default: float) -> float:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default

    try:
        return float(raw)
    except ValueError as error:
        raise RuntimeError(f"{name} must be a number.") from error
