"""Isolated local API/web/bot supervisor. Never reads the production env files."""
import argparse
import asyncio
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import socket
import subprocess
import sys
import time
import urllib.request

BOT_ROOT = Path(__file__).resolve().parents[1]
ROOT = BOT_ROOT.parents[1]
LOCAL = BOT_ROOT / ".local-test"
ENV_FILE = BOT_ROOT / ".env.local-test"
COMPOSE = ["docker", "--context", "desktop-linux", "compose", "-p", "fdp-local-test-bot", "-f", str(BOT_ROOT / "local-test.compose.yml")]
API_URL = "http://127.0.0.1:32207"
SITE_URL = "http://127.0.0.1:3003"
DATABASE_URL = "postgresql://fdp_local:fdp_local_only@127.0.0.1:32208/fdp_local_bot"
SAFE_OS_KEYS = {"PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "COMSPEC", "TEMP", "TMP", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "HOMEDRIVE", "HOMEPATH", "PROCESSOR_ARCHITECTURE", "PROGRAMFILES", "PROGRAMFILES(X86)", "PROGRAMDATA"}


def read_config():
    values = {}
    for line in ENV_FILE.read_text(encoding="utf-8-sig").splitlines():
        if line.strip() and not line.lstrip().startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def init():
    LOCAL.mkdir(exist_ok=True)
    if not ENV_FILE.exists():
        from cryptography.fernet import Fernet
        ENV_FILE.write_text(
            "# Paste the token of a SEPARATE BotFather test bot here. Never use FDPdotabot.\n"
            "DOTA_BOT_TOKEN=\n"
            "# Your numeric Telegram ID. /local_id in the test bot shows it.\n"
            "DOTA_BOT_ADMIN_IDS=\n"
            "# Optional LOCAL HTTP/SOCKS proxy, if Telegram is blocked on this connection.\n"
            "TELEGRAM_PROXY=\n"
            f"TELEGRAM_BOT_API_SECRET={secrets.token_hex(32)}\n"
            f"DOTA_BOT_ENCRYPTION_KEY={Fernet.generate_key().decode()}\n"
            f"JWT_SECRET={secrets.token_hex(32)}\n",
            encoding="utf-8",
        )


def environment(config, token=""):
    env = {key: value for key, value in os.environ.items() if key.upper() in SAFE_OS_KEYS}
    env.update({
        "NODE_ENV": "development", "API_PORT": "32207", "API_BIND_HOST": "127.0.0.1",
        "DATABASE_URL": DATABASE_URL, "REDIS_URL": "redis://127.0.0.1:32209/0",
        "JWT_SECRET": config["JWT_SECRET"], "TELEGRAM_BOT_API_SECRET": config["TELEGRAM_BOT_API_SECRET"],
        "DOTA_BOT_TOKEN": token, "DOTA_BOT_API_BASE_URL": API_URL, "DOTA_BOT_SITE_URL": SITE_URL,
        "DOTA_BOT_DATABASE_PATH": str(LOCAL / "bot.sqlite3"),
        "DOTA_BOT_ENCRYPTION_KEY": config["DOTA_BOT_ENCRYPTION_KEY"],
        "DOTA_BOT_ADMIN_IDS": config.get("DOTA_BOT_ADMIN_IDS", ""),
        "TELEGRAM_PROXY": config.get("TELEGRAM_PROXY", ""),
        "CORS_ALLOWED_ORIGINS": SITE_URL, "NEXT_PUBLIC_API_BASE_URL": API_URL,
        "NEXT_PUBLIC_SITE_URL": SITE_URL, "REPUTATION_ENGINE_ENABLED": "false",
        "SYSTEM_TOPS_REFRESH_ON_STARTUP": "false", "NEXT_TELEMETRY_DISABLED": "1",
        "PYTHONPATH": str(ROOT / "tmp" / "bot-qa-deps") + os.pathsep + str(BOT_ROOT),
        "PYTHONUTF8": "1", "PYTHONUNBUFFERED": "1",
        "DISCORD_BOT_TOKEN": "", "WAITLIST_BOT_TOKEN": "", "GOOGLE_SHEETS_PRIVATE_KEY": "",
    })
    return env


def prepare(node):
    env = environment(read_config())
    subprocess.run(COMPOSE + ["up", "-d", "--wait"], env=env, check=True)
    prisma = ROOT / "apps/api/node_modules/prisma/build/index.js"
    subprocess.run([node, str(prisma), "generate"], cwd=ROOT / "apps/api", env=env, check=True)
    for package in ("packages/shared", "packages/i18n", "apps/api"):
        subprocess.run([node, str(ROOT / "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"], cwd=ROOT / package, env=env, check=True)
    subprocess.run([node, str(prisma), "migrate", "deploy"], cwd=ROOT / "apps/api", env=env, check=True)
    subprocess.run([node, str(ROOT / "apps/api/prisma/seed.mjs")], cwd=LOCAL, env=env, check=True)
    subprocess.run([node, str(Path(__file__).with_name("seed_local.mjs"))], cwd=LOCAL, env=env, check=True)


async def verify_test_token(token, proxy=None):
    from aiogram import Bot
    from bot.services.telegram_session import RetryingAiohttpSession
    bot = Bot(token, session=RetryingAiohttpSession(proxy=proxy or None))
    try:
        identity = await bot.get_me(request_timeout=15)
        if (identity.username or "").lower() == "fdpdotabot":
            raise ValueError("Production bot is forbidden in the local launcher")
        return identity.username
    finally:
        await bot.session.close()


def supervise(node):
    from bot.config import parse_admin_ids
    guard = socket.socket()
    if os.name == "nt":
        guard.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
    guard.bind(("127.0.0.1", 32206))
    guard.listen(1)
    stop_file = LOCAL / "stop"
    stop_file.unlink(missing_ok=True)
    children = {}
    handles = []

    def start(name, args, env, cwd=LOCAL):
        log = (LOCAL / f"{name}.log").open("a", encoding="utf-8")
        handles.append(log)
        children[name] = subprocess.Popen(args, cwd=cwd, env=env, stdout=log, stderr=log)

    def stop_child(name):
        child = children.pop(name, None)
        if child and child.poll() is None:
            if os.name == "nt":
                try:
                    subprocess.run(
                        ["taskkill", "/PID", str(child.pid), "/T", "/F"],
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        timeout=5,
                    )
                except subprocess.TimeoutExpired:
                    pass
                if child.poll() is None:
                    child.kill()
            else:
                child.terminate()
            child.wait(timeout=5)

    def status(state, username=None):
        (LOCAL / "status.json").write_text(json.dumps({
            "state": state, "supervisorPid": os.getpid(), "botUsername": username,
            "api": API_URL, "site": SITE_URL,
            "processes": {name: child.pid for name, child in children.items()},
        }), encoding="utf-8")

    config = read_config()
    env = environment(config)
    start("api", [node, str(ROOT / "apps/api/dist/main.js")], env)
    start("web", [node, str(ROOT / "apps/web/node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", "3003", "--webpack"], env, ROOT / "apps/web")
    active = None
    rejected = None
    retry_at = 0
    status("waiting_for_token")
    print(f"Local API/web started. Waiting for test token in {ENV_FILE}", flush=True)
    try:
        while not stop_file.exists():
            config = read_config()
            token = config.get("DOTA_BOT_TOKEN", "")
            desired = (token, config.get("DOTA_BOT_ADMIN_IDS", ""))
            if not token and active is not None:
                stop_child("bot")
                stop_child("api")
                start("api", [node, str(ROOT / "apps/api/dist/main.js")], environment(config))
                active = None
                status("waiting_for_token")
            if token and desired != active and (desired != rejected or time.monotonic() >= retry_at):
                try:
                    if not re.fullmatch(r"\d{5,15}:[A-Za-z0-9_-]{20,}", token):
                        raise ValueError("Invalid token format")
                    parse_admin_ids(desired[1])
                    username = asyncio.run(verify_test_token(token, config.get("TELEGRAM_PROXY")))
                except Exception as error:
                    print(f"Test bot configuration rejected ({type(error).__name__}); token is hidden. Edit the file to retry.", flush=True)
                    rejected = desired
                    retry_at = time.monotonic() + 30
                    status("invalid_test_config")
                else:
                    stop_child("bot")
                    stop_child("api")
                    env = environment(config, token)
                    start("api", [node, str(ROOT / "apps/api/dist/main.js")], env)
                    # Wait for the isolated API before allowing bot polling.
                    for _ in range(30):
                        try:
                            with urllib.request.urlopen(API_URL + "/health", timeout=2) as response:
                                if response.status == 200:
                                    break
                        except Exception:
                            time.sleep(1)
                    else:
                        raise RuntimeError("Local API did not become healthy; see api.log")
                    start("bot", [sys.executable, str(Path(__file__).with_name("local_bot.py"))], env)
                    active, rejected = desired, None
                    status("running", username)
                    print(f"Local test bot @{username} started; all data stays in the isolated databases.", flush=True)
            if any(child.poll() is not None for child in children.values()):
                status("process_failed")
                raise RuntimeError("A local child process stopped; see its log")
            time.sleep(2)
    finally:
        for name in list(children):
            stop_child(name)
        for handle in handles:
            handle.close()
        guard.close()
        status("stopped")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("init", "prepare", "run", "stop"))
    parser.add_argument("--node", default=shutil.which("node"))
    args = parser.parse_args()
    init()
    if args.action == "init":
        print(f"Config created: {ENV_FILE}")
    elif args.action == "prepare":
        prepare(args.node)
    elif args.action == "run":
        supervise(args.node)
    elif args.action == "stop":
        (LOCAL / "stop").touch()
        print("Stop requested. Local databases are retained.")


if __name__ == "__main__":
    main()
