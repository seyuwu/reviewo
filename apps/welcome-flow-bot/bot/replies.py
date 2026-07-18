from dataclasses import dataclass
from pathlib import Path
import json

from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from .config import Settings


@dataclass(frozen=True)
class WelcomeTemplate:
    id: str
    text: str


@dataclass(frozen=True)
class BuiltWelcome:
    template_id: str
    text: str
    reply_markup: InlineKeyboardMarkup


class TemplateStore:
    def __init__(self, templates: list[WelcomeTemplate]) -> None:
        if not templates:
            raise RuntimeError("templates.json must contain at least one template.")

        self._templates = templates
        self._by_id = {item.id: item for item in templates}

    @property
    def ids(self) -> list[str]:
        return [item.id for item in self._templates]

    def get(self, template_id: str) -> WelcomeTemplate:
        return self._by_id[template_id]


def load_templates(path: Path, settings: Settings, channel_url: str) -> TemplateStore:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        raise RuntimeError("templates.json must be a JSON array.")

    templates: list[WelcomeTemplate] = []

    for item in raw:
        if not isinstance(item, dict):
            raise RuntimeError("Each template must be an object with id and text.")

        template_id = str(item.get("id", "")).strip()
        text = str(item.get("text", "")).strip()

        if not template_id or not text:
            raise RuntimeError("Each template needs non-empty id and text.")

        rendered = text.replace("{channel_url}", channel_url)
        validate_template(template_id, text, rendered, settings)
        templates.append(WelcomeTemplate(id=template_id, text=text))

    return TemplateStore(templates)


def validate_template(template_id: str, source: str, rendered: str, settings: Settings) -> None:
    first_line = source.splitlines()[0].strip() if source else ""
    if len(first_line) > settings.max_first_line_len:
        raise RuntimeError(
            f"Template {template_id}: first line is {len(first_line)} chars "
            f"(max {settings.max_first_line_len})."
        )

    if len(rendered) > settings.max_template_len:
        raise RuntimeError(
            f"Template {template_id}: rendered length {len(rendered)} "
            f"(max {settings.max_template_len})."
        )


def build_welcome(
    store: TemplateStore,
    template_id: str,
    channel_url: str,
) -> BuiltWelcome:
    template = store.get(template_id)
    text = template.text.replace("{channel_url}", channel_url)

    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="Смотреть канал", url=channel_url)],
            [InlineKeyboardButton(text="Другой контакт", callback_data="cta:contact")],
        ]
    )

    return BuiltWelcome(template_id=template_id, text=text, reply_markup=keyboard)


def build_contact_type_keyboard(username: str | None) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = []

    if username:
        rows.append(
            [
                InlineKeyboardButton(
                    text=f"Оставить @{username}",
                    callback_data="contact:use_username",
                )
            ]
        )

    rows.extend(
        [
            [
                InlineKeyboardButton(text="Telegram", callback_data="contact:type:telegram_username"),
                InlineKeyboardButton(text="Discord", callback_data="contact:type:discord"),
            ],
            [
                InlineKeyboardButton(text="Email", callback_data="contact:type:email"),
                InlineKeyboardButton(text="Другое", callback_data="contact:type:other"),
            ],
            [InlineKeyboardButton(text="Отмена", callback_data="contact:cancel")],
        ]
    )

    return InlineKeyboardMarkup(inline_keyboard=rows)


def contact_prompt(preferred_contact: str) -> str:
    prompts = {
        "telegram_username": "Напиши свой Telegram username (например @nickname).",
        "discord": "Напиши свой Discord (например name#0000 или @handle).",
        "email": "Напиши email. Пока без подтверждения — сохраним как неподтверждённый.",
        "other": "Напиши любой удобный контакт одной строкой.",
    }
    return prompts.get(preferred_contact, "Напиши контакт одной строкой.")


def after_contact_saved_message(confirmed: bool) -> str:
    if confirmed:
        return "Записал. Напишу, когда откроем набор — спасибо 🙂"
    return (
        "Записал email как неподтверждённый. "
        "Напишу, когда откроем набор — спасибо 🙂"
    )
