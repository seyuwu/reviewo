from dataclasses import dataclass
import os
from urllib.parse import urlparse

from cryptography.fernet import Fernet


@dataclass(frozen=True)
class Settings:
    bot_token: str
    api_base_url: str
    site_url: str
    api_secret: str
    encryption_key: bytes
    database_path: str
    telegram_proxy: str | None


def load_settings() -> Settings:
    api_base_url = required_env("DOTA_BOT_API_BASE_URL").rstrip("/")
    site_url = os.getenv("DOTA_BOT_SITE_URL", "https://dota.opinia.ru").strip().rstrip("/")
    parsed_api = urlparse(api_base_url)
    parsed_site = urlparse(site_url)
    if parsed_api.scheme not in {"http", "https"} or not parsed_api.netloc:
        raise RuntimeError("DOTA_BOT_API_BASE_URL must be a valid HTTP(S) URL")
    if parsed_site.scheme not in {"http", "https"} or not parsed_site.netloc:
        raise RuntimeError("DOTA_BOT_SITE_URL must be a valid HTTP(S) URL")

    key = required_env("DOTA_BOT_ENCRYPTION_KEY").encode("ascii")
    try:
        Fernet(key)
    except (ValueError, TypeError) as error:
        raise RuntimeError("DOTA_BOT_ENCRYPTION_KEY must be a Fernet key") from error

    return Settings(
        bot_token=required_env("DOTA_BOT_TOKEN"),
        api_base_url=api_base_url,
        site_url=site_url,
        api_secret=required_env("TELEGRAM_BOT_API_SECRET"),
        encryption_key=key,
        database_path=os.getenv("DOTA_BOT_DATABASE_PATH", "/data/dota_bot.db").strip()
        or "/data/dota_bot.db",
        telegram_proxy=os.getenv("TELEGRAM_PROXY", "").strip() or None,
    )


def required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value or value.lower().startswith("change_me"):
        raise RuntimeError(f"{name} is required")
    return value
