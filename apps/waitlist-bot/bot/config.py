from dataclasses import dataclass
import os


@dataclass(frozen=True)
class Settings:
    bot_token: str
    channel_url: str
    support_url: str
    admin_ids: frozenset[int]
    database_path: str


def load_settings() -> Settings:
    bot_token = get_required_env("WAITLIST_BOT_TOKEN")

    return Settings(
        bot_token=bot_token,
        channel_url=os.getenv("WAITLIST_CHANNEL_URL", "https://t.me/opinia_official").strip(),
        support_url=os.getenv("WAITLIST_SUPPORT_URL", "https://t.me/opinia_support").strip(),
        admin_ids=parse_admin_ids(os.getenv("WAITLIST_ADMIN_IDS", "")),
        database_path=os.getenv("WAITLIST_DATABASE_PATH", "/data/waitlist.db").strip()
        or "/data/waitlist.db",
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
            raise RuntimeError(f"WAITLIST_ADMIN_IDS contains a non-numeric id: {item}") from error

    return frozenset(admin_ids)
