"""Read existing durable journals in the background; no hooks in search handlers."""
import asyncio
from datetime import UTC, datetime, timedelta
import logging
from html import escape
import uuid

import aiohttp
from aiogram import Bot
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup
from .telegram_session import RetryingAiohttpSession

logger = logging.getLogger(__name__)


def initialize_stream(storage):
    with storage.lock:
        return _initialize_stream(storage)


def _initialize_stream(storage):
    connection = storage._connection()
    connection.execute("CREATE INDEX IF NOT EXISTS idx_reward_funnel_source ON bot_funnel_events(occurred_at,event_type,telegram_user_id)")
    connection.execute("CREATE INDEX IF NOT EXISTS idx_reward_activity_time ON bot_activity_events(occurred_at,id)")
    connection.execute("CREATE INDEX IF NOT EXISTS idx_reward_users_seen ON bot_users(last_seen_at,telegram_user_id)")
    connection.execute("CREATE TABLE IF NOT EXISTS reward_profile_exports(campaign TEXT NOT NULL,telegram_user_id INTEGER NOT NULL,PRIMARY KEY(campaign,telegram_user_id))")
    connection.commit()
    source = storage.get_choice(0, "reward_source", 0)
    if not source:
        source = {"id": uuid.uuid4().hex}
        storage.set_choices(0, "reward_source", [source])
    return source["id"]


def source_batch(storage, cursor, started_at, source, now=None):
    with storage.lock:
        return _source_batch(storage, cursor, started_at, source, now)


def _source_batch(storage, cursor, started_at, source, now=None):
    now = now or datetime.now(UTC)
    connection = storage._connection()
    if not cursor:
        last = connection.execute("SELECT COALESCE(MAX(id),0) FROM bot_activity_events WHERE occurred_at < ?", (started_at,)).fetchone()[0]
        cursor = {"activity": int(last), "funnelAt": started_at, "funnelUser": 0,"userAt":started_at,"userId":0}
    next_cursor = dict(cursor)
    events = []
    rows = connection.execute("SELECT * FROM bot_activity_events WHERE id>? ORDER BY id LIMIT 50", (cursor["activity"],)).fetchall()
    for row in rows:
        at = datetime.fromisoformat(row["occurred_at"])
        if at > now - timedelta(seconds=120):
            break
        next_cursor["activity"] = row["id"]
        if row["occurred_at"] < started_at or row["event_type"] not in {"search_started", "party_created", "party_joined", "search_result"}:
            continue
        if row["event_type"] == "search_started":
            active = connection.execute("SELECT started_at FROM active_search_timers WHERE telegram_user_id=?", (row["telegram_user_id"],)).fetchone()
            if not active or active["started_at"] != row["occurred_at"]:
                continue  # A short cancelled/replaced search earns nothing; successful joins have their own event.
        events.append({"id": f"{source}:activity:{row['id']}", "telegramId": str(row["telegram_user_id"]), "kind": row["event_type"], "occurredAt": row["occurred_at"]})
    ready = connection.execute("""SELECT * FROM bot_funnel_events WHERE event_type='account_ready' AND occurred_at>=?
      AND (occurred_at>? OR (occurred_at=? AND telegram_user_id>?))
      ORDER BY occurred_at,telegram_user_id LIMIT 50""", (started_at, cursor["funnelAt"], cursor["funnelAt"], cursor["funnelUser"])).fetchall()
    for row in ready:
        events.append({"id": f"{source}:ready:{row['telegram_user_id']}", "telegramId": str(row["telegram_user_id"]), "kind": "account_ready", "occurredAt": row["occurred_at"]})
        next_cursor["funnelAt"], next_cursor["funnelUser"] = row["occurred_at"], row["telegram_user_id"]
    # Existing ready accounts receive the welcome bonus on their first activity
    # after launch. Read the existing last-seen index; nothing hooks hot handlers.
    user_at,user_id=cursor.get("userAt",started_at),cursor.get("userId",0)
    users=connection.execute("""SELECT u.telegram_user_id,u.last_seen_at,f.occurred_at AS ready_at,x.telegram_user_id AS exported
      FROM bot_users u LEFT JOIN bot_funnel_events f ON f.telegram_user_id=u.telegram_user_id AND f.event_type='account_ready'
      LEFT JOIN reward_profile_exports x ON x.telegram_user_id=u.telegram_user_id AND x.campaign=?
      WHERE (u.last_seen_at>? OR (u.last_seen_at=? AND u.telegram_user_id>?))
      ORDER BY u.last_seen_at,u.telegram_user_id LIMIT ?""",(started_at,user_at,user_at,user_id,100-len(events))).fetchall()
    for row in users:
        if row["ready_at"] and not row["exported"]:
            events.append({"id":f"{source}:ready:{row['telegram_user_id']}","telegramId":str(row["telegram_user_id"]),"kind":"account_ready","occurredAt":row["last_seen_at"]})
        next_cursor["userAt"],next_cursor["userId"]=row["last_seen_at"],row["telegram_user_id"]
    unique = {}
    for event in events:
        unique.setdefault(event["id"],event)
    return list(unique.values()), next_cursor


def acknowledge_profiles(storage,events,campaign):
    with storage.lock:
        storage._connection().executemany("INSERT OR IGNORE INTO reward_profile_exports(campaign,telegram_user_id) VALUES (?,?)",[(campaign,int(event["telegramId"])) for event in events if event["kind"]=="account_ready"])
        storage._connection().commit()


async def rewards_sync_worker(api, storage, settings):
    source = await asyncio.to_thread(initialize_stream, storage)
    delay = 30
    # This session and connector are completely separate from OpiniaApi.user/search.
    async with Bot(token=settings.bot_token,session=RetryingAiohttpSession(proxy=settings.telegram_proxy)).context() as notice_bot, aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=5,connect=2), connector=aiohttp.TCPConnector(limit=1)) as session:
        headers = {"X-Telegram-Bot-Secret": settings.api_secret}
        async def request(method, path, body=None):
            async with session.request(method, settings.api_base_url + path, json=body, headers=headers) as response:
                if response.status >= 400:
                    raise RuntimeError("Reward background API unavailable")
                return await response.json()
        while True:
            try:
                config = await request("GET", "/telegram/rewards/config")
                api.reward_program = config
                for notice in config.get("notices",[]):
                    notice_id="rewards:"+notice["id"]
                    delivered=storage.has_delivered_notification(notice_id)
                    try:
                        if not delivered:
                            payload=notice["payload"]
                            if payload.get("kind")=="winner":
                                text=f"🎉 Твой билет №{payload['number']} выиграл!\n\n{escape(payload['prize'])}\n\nАдминистратор свяжется с тобой для выдачи приза."
                                target=f"rewards:raffle:{payload['giveawayId']}"
                            else:
                                text=f"☘️ +{payload['amount']} {escape(payload['currency'])}\n{escape(payload['title'])}\n\nВ разделе «{escape(payload['programName'])}» можно заработать ещё и купить билеты."
                                target="rewards:home"
                            await notice_bot.send_message(int(notice["telegramId"]),text,parse_mode="HTML",reply_markup=InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="Открыть награды",callback_data=target)]]))
                            storage.remember_delivered_notification(notice_id)
                            delivered=True
                    except asyncio.CancelledError:
                        raise
                    except Exception:
                        logger.warning("Reward notice delivery will retry")
                    await request("POST",f"/telegram/rewards/notices/{notice['id']}",{"delivered":delivered})
                if config.get("enabled") and config.get("startedAt"):
                    # Normalize API Z/milliseconds to the SQLite ISO representation for comparisons.
                    started = datetime.fromisoformat(config["startedAt"].replace("Z", "+00:00")).isoformat()
                    key = "reward_cursor_" + source
                    cursor = storage.get_choice(0, key, 0)
                    if cursor and cursor.get("campaign") != started:
                        cursor = None
                    events, next_cursor = await asyncio.to_thread(source_batch, storage, cursor, started, source)
                    acknowledged = not events
                    if events:
                        result = await request("POST", "/telegram/rewards/sync", {"events": events})
                        acknowledged = result.get("ok") is True and result.get("enabled") is True
                    if acknowledged:
                        await asyncio.to_thread(acknowledge_profiles,storage,events,started)
                        storage.set_choices(0, key, [{**next_cursor, "campaign": started}])
                delay = 30
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.warning("Reward journal sync unavailable; saved events will retry")
                delay = min(300, delay * 2)
            await asyncio.sleep(delay)
