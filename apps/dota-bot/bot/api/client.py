import asyncio
import json
import time
from typing import Any

import aiohttp

from ..config import Settings
from ..storage.database import BotStorage


class ApiError(Exception):
    def __init__(self, message: str, status: int = 0) -> None:
        super().__init__(message)
        self.status = status


class OpiniaApi:
    def __init__(self, settings: Settings, storage: BotStorage) -> None:
        self.settings = settings
        self.storage = storage
        self.session: aiohttp.ClientSession | None = None
        self.refresh_locks: dict[int, asyncio.Lock] = {}

    async def start(self) -> None:
        timeout = aiohttp.ClientTimeout(total=15, connect=5)
        connector = aiohttp.TCPConnector(ssl=True)
        self.session = aiohttp.ClientSession(timeout=timeout, connector=connector)

    async def close(self) -> None:
        if self.session is not None:
            await self.session.close()
            self.session = None

    async def public(self, method: str, path: str, body: dict | None = None) -> Any:
        return await self._request(method, path, body=body)

    async def user(
        self,
        telegram_user_id: int,
        method: str,
        path: str,
        body: dict | None = None,
        *,
        bot_secret: bool = False,
    ) -> Any:
        credentials = self.storage.get_session(telegram_user_id)
        if credentials is None:
            raise ApiError("Аккаунт не привязан. Откройте /start и привяжите Opinia.", 401)

        try:
            return await self._request(
                method,
                path,
                body=body,
                access_token=credentials.access_token,
                bot_secret=bot_secret,
            )
        except ApiError as error:
            if error.status != 401:
                raise

        lock = self.refresh_locks.setdefault(telegram_user_id, asyncio.Lock())
        async with lock:
            latest = self.storage.get_session(telegram_user_id)
            if latest is None:
                raise ApiError("Аккаунт не привязан. Откройте /start и привяжите Opinia.", 401)
            if latest.access_token != credentials.access_token:
                try:
                    return await self._request(
                        method,
                        path,
                        body=body,
                        access_token=latest.access_token,
                        bot_secret=bot_secret,
                    )
                except ApiError as error:
                    if error.status != 401:
                        raise
            refreshed = await self._request(
                "POST", "/auth/refresh", body={"refreshToken": latest.refresh_token}
            )
            self.storage.save_session(
                telegram_user_id,
                refreshed["accessToken"],
                refreshed["refreshToken"],
                latest.recovery_url,
            )
        return await self._request(
            method,
            path,
            body=body,
            access_token=refreshed["accessToken"],
            bot_secret=bot_secret,
        )

    async def create_web_access_ticket(self, telegram_user_id: int) -> str:
        result = await self.user(telegram_user_id, "POST", "/telegram/web-access-ticket")
        return str(result["ticket"])

    async def complete_link(self, code: str, telegram_user_id: int) -> dict:
        return await self._request(
            "POST",
            "/telegram/link",
            body={"code": code, "telegramUserId": str(telegram_user_id)},
            bot_secret=True,
        )

    async def ensure_telegram_link(self, telegram_user_id: int) -> dict:
        return await self.user(
            telegram_user_id,
            "POST",
            "/telegram/ensure-link",
            {"telegramUserId": str(telegram_user_id)},
            bot_secret=True,
        )

    async def poll_notifications(self) -> list[dict]:
        result = await self._request(
            "GET", "/telegram/notifications", bot_secret=True
        )
        return result if isinstance(result, list) else []

    async def record_notification_delivery(
        self, notification_id: str, telegram_user_id: int, delivered: bool
    ) -> None:
        await self._request(
            "POST",
            "/telegram/notifications/delivery",
            body={
                "delivered": delivered,
                "id": notification_id,
                "telegramUserId": str(telegram_user_id),
            },
            bot_secret=True,
        )

    async def fetch_party_card(self, site_url: str, party_slug: str, cache_buster: str) -> bytes:
        if self.session is None:
            raise RuntimeError("OpiniaApi.start() must be called first")
        from urllib.parse import quote

        url = f"{site_url}/og/dota/teams/{quote(party_slug, safe='')}?v={cache_buster or time.time_ns()}"
        try:
            async with self.session.get(
                url,
                headers={"Cache-Control": "no-cache", "Pragma": "no-cache"},
                proxy=self.settings.telegram_proxy,
            ) as response:
                if response.status != 200:
                    raise ApiError("Не удалось обновить карточку пати", response.status)
                image = await response.read()
                if len(image) > 8 * 1024 * 1024:
                    raise ApiError("Карточка пати слишком большая")
                return image
        except aiohttp.ClientError as error:
            raise ApiError("Не удалось загрузить карточку пати") from error

    async def _request(
        self,
        method: str,
        path: str,
        body: dict | None = None,
        access_token: str | None = None,
        bot_secret: bool = False,
    ) -> Any:
        if self.session is None:
            raise RuntimeError("OpiniaApi.start() must be called first")

        headers: dict[str, str] = {}
        if access_token:
            headers["Authorization"] = f"Bearer {access_token}"
        if bot_secret:
            headers["X-Telegram-Bot-Secret"] = self.settings.api_secret

        try:
            async with self.session.request(
                method,
                f"{self.settings.api_base_url}{path}",
                json=body,
                headers=headers,
            ) as response:
                raw = await response.text()
                try:
                    data = json.loads(raw) if raw else None
                except json.JSONDecodeError:
                    data = None
                if response.status >= 400:
                    message = extract_error_message(data) or "Ошибка связи с Opinia API"
                    raise ApiError(message, response.status)
                return data
        except aiohttp.ClientError as error:
            raise ApiError("Не удалось связаться с Opinia. Попробуйте ещё раз позже.") from error


def extract_error_message(data: Any) -> str | None:
    if not isinstance(data, dict):
        return None
    message = data.get("message")
    if isinstance(message, list):
        return "; ".join(str(item) for item in message)
    return str(message) if message else None
