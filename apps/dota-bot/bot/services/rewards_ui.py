import hashlib
from html import escape
from pathlib import Path
import secrets

from aiogram.types import BufferedInputFile

ASSETS = Path(__file__).resolve().parents[1] / "assets" / "rewards"
SCENES = {"home": "home", "earn": "earn", "history": "home", "raffle": "raffle", "confirm": "raffle", "tickets": "raffle"}
_asset_cache = {}


def scene_for(screen):
    return SCENES.get(screen.split(":")[-1], "home")


def reward_photo(storage, screen):
    scene = scene_for(screen)
    path = ASSETS / f"marina-{scene}.png"
    modified = path.stat().st_mtime_ns
    if scene not in _asset_cache or _asset_cache[scene][0] != modified:
        raw = path.read_bytes()
        _asset_cache[scene] = (modified, raw, hashlib.sha256(raw).hexdigest())
    _, raw, digest = _asset_cache[scene]
    cached = storage.get_choice(0, f"reward_image_{scene}", 0) or {}
    if cached.get("digest") == digest and cached.get("fileId"):
        return str(cached["fileId"])
    return BufferedInputFile(raw, filename=path.name)


def save_reward_photo(storage, screen, message):
    if not screen.startswith("rewards:") or not getattr(message, "photo", None):
        return
    scene = scene_for(screen)
    if scene in _asset_cache:
        storage.set_choices(0, f"reward_image_{scene}", [{"digest": _asset_cache[scene][2], "fileId": message.photo[-1].file_id}])


def marina_phrase(storage, user_id, settings, scene):
    phrases = settings.get("phrases", {}).get(scene) or ["Рада тебя видеть!"]
    last = storage.get_choice(user_id, "reward_phrase", 0) or {}
    options = [value for value in phrases if value != last.get("text")] or phrases
    phrase = secrets.choice(options)
    storage.set_choices(user_id, "reward_phrase", [{"text": phrase}])
    return f"<b>{escape(settings.get('mascotName', 'Марина'))}:</b> {escape(phrase)}"
