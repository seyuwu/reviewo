import re

DEFAULT_BROADCAST_TTL_SECONDS = 60 * 60
MAX_BROADCAST_TTL_SECONDS = 47 * 60 * 60
BROADCAST_TTL_PRESETS = (60, 10 * 60, 60 * 60, 6 * 60 * 60, 24 * 60 * 60)


def validate_broadcast_duration(seconds: int) -> int:
    if type(seconds) is not int or not 1 <= seconds <= MAX_BROADCAST_TTL_SECONDS:
        raise ValueError("Срок удаления должен быть от 1 секунды до 47 часов.")
    return seconds


def parse_broadcast_duration(text: str) -> int:
    match = re.fullmatch(r"\s*(\d{1,6})\s*([a-zа-я]+)?\s*", text.lower())
    if not match:
        raise ValueError("Напиши время, например: 30 сек, 10 мин, 2 ч или 1 день.")
    units = {
        "с": 1, "сек": 1, "секунда": 1, "секунды": 1, "секунд": 1, "s": 1,
        "м": 60, "мин": 60, "минута": 60, "минуты": 60, "минут": 60, "m": 60,
        "ч": 3600, "час": 3600, "часа": 3600, "часов": 3600, "h": 3600,
        "д": 86400, "день": 86400, "дня": 86400, "дней": 86400, "d": 86400,
    }
    unit = match.group(2) or "мин"
    if unit not in units:
        raise ValueError("Используй секунды, минуты, часы или дни. Число без единицы — минуты.")
    return validate_broadcast_duration(int(match.group(1)) * units[unit])


def format_broadcast_duration(seconds: int) -> str:
    for divisor, label in ((86400, "дн."), (3600, "ч"), (60, "мин")):
        if seconds % divisor == 0:
            return f"{seconds // divisor} {label}"
    return f"{seconds} сек"
