from aiogram.types import MessageEntity
from pydantic import ValidationError


def normalize_broadcast_entities(text: str, entities=None) -> list[dict]:
    if entities is None:
        return []
    if not isinstance(entities, (list, tuple)):
        raise ValueError("Не удалось прочитать форматирование. Отправь сообщение ещё раз.")
    text_length = len(text.encode("utf-16-le")) // 2
    result = []
    for value in entities:
        try:
            entity = value if isinstance(value, MessageEntity) else MessageEntity.model_validate(value)
        except (ValidationError, TypeError) as error:
            raise ValueError("Не удалось прочитать форматирование. Отправь сообщение ещё раз.") from error
        if entity.offset < 0 or entity.length <= 0 or entity.offset + entity.length > text_length:
            raise ValueError("Форматирование не совпадает с текстом. Отправь сообщение ещё раз.")
        result.append(entity.model_dump(mode="json", exclude_none=True))
    return result


def broadcast_preview_pages(text: str, entities=None) -> list[tuple[str, list[dict]]]:
    formatting = normalize_broadcast_entities(text, entities)
    pages = []
    start = 0
    start_units = 0
    units = 0
    for index, character in enumerate(text):
        size = len(character.encode("utf-16-le")) // 2
        if units - start_units + size > 700:
            pages.append((text[start:index], start_units, units))
            start, start_units = index, units
        units += size
    pages.append((text[start:], start_units, units))
    result = []
    for chunk, first, last in pages:
        clipped = []
        for entity in formatting:
            left = max(first, entity["offset"])
            right = min(last, entity["offset"] + entity["length"])
            if left < right:
                clipped.append({**entity, "offset": left - first, "length": right - left})
        result.append((chunk, clipped))
    return result


def validate_broadcast_content(text: str, photo_file_id: str | None = None) -> None:
    if not isinstance(text, str):
        raise ValueError("Отправь текст объявления или фото с подписью.")
    if photo_file_id is not None and (
        not isinstance(photo_file_id, str) or not photo_file_id.strip() or len(photo_file_id) > 512
    ):
        raise ValueError("Не удалось сохранить фото. Отправь его ещё раз как картинку.")
    if not text.strip() and photo_file_id is None:
        raise ValueError("Отправь текст объявления или фото с подписью.")
    limit = 1024 if photo_file_id else 4096
    # Telegram entity offsets and lengths use UTF-16, including emoji surrogate pairs.
    if len(text.encode("utf-16-le")) // 2 > limit:
        label = "Подпись к фото" if photo_file_id else "Текст"
        raise ValueError(f"{label} длиннее лимита Telegram. Сократи до {limit} символов и отправь ещё раз.")
