from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup


def home_keyboard(registered: bool, has_party: bool) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = []
    if registered:
        rows.extend(
            [
                [button("🎯 Ищу пати", "search:looking"), button("🧭 Набираю игроков", "search:recruit")],
                [button("👥 Моя пати", "panel:party"), button("🔎 Игроки", "search:list")],
                [button("📨 Заявки и приглашения", "panel:invites")],
                [button("👤 Профиль", "panel:profile"), button("ℹ️ Аккаунт", "panel:account")],
            ]
        )
        if has_party:
            rows.insert(1, [button("⏹ Остановить поиск", "search:stop")])
    else:
        rows.append([button("🆕 Создать Dota-профиль", "register:start")])
        rows.append([button("🔗 Привязать аккаунт сайта", "account:help")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def back_keyboard(target: str = "home") -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[button("← Назад", f"panel:{target}")]])


def candidate_keyboard(candidates: list[dict], mode: str = "looking") -> InlineKeyboardMarkup:
    rows = []
    for index, candidate in enumerate(candidates[:20]):
        role = candidate.get("positionRole") or candidate.get("roles", [None])[0]
        title = str(candidate.get("title") or candidate.get("slug") or "Игрок")
        mmr = candidate.get("mmr") or "?"
        suffix = f" · {mmr} MMR"
        if mode == "recruit":
            label = f"➕ {truncate(title, 24)}{suffix}"
        else:
            label = f"{truncate(title, 24)}{suffix}"
        rows.append([button(label, f"candidate:{index}")])
    rows.extend([[button("🔄 Обновить", "search:list")], [button("← В меню", "panel:home")]])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def candidate_action_keyboard(candidate: dict, mode: str) -> InlineKeyboardMarkup:
    rows = []
    if candidate.get("partySlug"):
        open_roles = candidate.get("recruitedRoles") or candidate.get("roles") or []
        for role in open_roles[:5]:
            rows.append([button(f"Подать заявку · позиция {role}", f"candidate:apply:{role}")])
    elif mode == "recruit":
        for role in candidate.get("roles", [])[:5]:
            rows.append([button(f"Пригласить · позиция {role}", f"candidate:invite:{role}")])
    else:
        rows.append([button("Пригласить в пати", "candidate:invite:0")])
    rows.append([button("← К игрокам", "panel:candidates")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def invite_keyboard(invite_id: str, invite_kind: str) -> InlineKeyboardMarkup:
    if invite_kind == "APPLICATION":
        buttons = [button("✅ Принять заявку", f"invite:{invite_id}:accept"), button("✖️ Отклонить", f"invite:{invite_id}:decline")]
    else:
        buttons = [button("✅ Принять", f"invite:{invite_id}:accept"), button("✖️ Отклонить", f"invite:{invite_id}:decline")]
    return InlineKeyboardMarkup(inline_keyboard=[buttons])


def role_keyboard(selected: list[str]) -> InlineKeyboardMarkup:
    rows = []
    names = {"1": "Керри", "2": "Мид", "3": "Оффлейн", "4": "Саппорт", "5": "Хард-саппорт"}
    for role in ("1", "2", "3", "4", "5"):
        marker = "✅ " if role in selected else ""
        rows.append([button(f"{marker}{names[role]}", f"recruit:toggle:{','.join(selected)}:{role}")])
    rows.append([button("🔍 Начать набор", "recruit:start")])
    rows.append([button("← В меню", "panel:home")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def account_keyboard(linked: bool, recovery_available: bool) -> InlineKeyboardMarkup:
    rows = []
    rows.append([button("Отвязать Telegram" if linked else "Как привязать аккаунт", "account:unlink" if linked else "account:help")])
    if recovery_available:
        rows.append([button("🔐 Показать ссылку восстановления", "account:recovery")])
    rows.append([button("← В меню", "panel:home")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def button(text: str, callback_data: str) -> InlineKeyboardButton:
    return InlineKeyboardButton(text=text, callback_data=callback_data)


def truncate(value: str, limit: int) -> str:
    return value if len(value) <= limit else f"{value[: limit - 1]}…"
