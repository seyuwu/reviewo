from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup


def home_keyboard(
    registered: bool,
    has_party: bool,
    is_recruiting: bool = False,
) -> InlineKeyboardMarkup:
    second_label = "⏹ Остановить набор" if is_recruiting else "🧭 Набираю игроков"
    second_action = "search:stop" if is_recruiting else "search:recruit"
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [button("🎯 Ищу пати", "search:looking"), button(second_label, second_action)],
            [button("👤 Аккаунт", "panel:account")],
        ]
    )


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
        recruit_role = candidate.get("_recruitRole")
        roles = [recruit_role] if recruit_role else candidate.get("roles", [])[:5]
        for role in roles:
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
    role_row = [
        button(f"{'✅' if role in selected else ''}{role}", f"recruit:toggle:{role}")
        for role in ("1", "2", "3", "4", "5")
    ]
    return InlineKeyboardMarkup(
        inline_keyboard=[
            role_row,
            [button("🔍 Начать набор", "recruit:start")],
            [button("← Назад", "panel:home")],
        ]
    )


def recruiting_party_keyboard(party: dict) -> InlineKeyboardMarkup:
    return party_keyboard(party, bool(party.get("canManageParty")), is_recruiting=True)


def party_keyboard(party: dict, show_search: bool, is_recruiting: bool = False) -> InlineKeyboardMarkup:
    occupants = party_slot_occupants(party)
    roles = ("1", "2", "3", "4", "5")
    slots = [button(truncate(occupants.get(role, role), 12), f"party:slot:{role}") for role in roles]
    return InlineKeyboardMarkup(
        inline_keyboard=[
            slots,
            *([[button("🔍" if role not in occupants else "—", f"party:search:{role}" if role not in occupants else f"party:noop:{role}") for role in roles]] if show_search else []),
            *([[button("⏹ Остановить набор", "search:stop")]] if party.get("canManageParty") and is_recruiting else []),
            [button("← Назад", "panel:home")],
        ]
    )


def party_slot_occupants(party: dict) -> dict[str, str]:
    occupants: dict[str, str] = {}
    for member in party.get("members") or []:
        role = str(member.get("positionRole") or "")
        if role in {"1", "2", "3", "4", "5"} and role not in occupants:
            occupants[role] = str(member.get("displayName") or "Игрок")
    return occupants


def party_member_keyboard(member: dict, can_kick: bool, site_url: str, back_target: str = "party") -> InlineKeyboardMarkup:
    rows = []
    if member.get("dotaSlug"):
        rows.append([button_url("🌐 Открыть профиль на сайте", f"{site_url}/dota/{member['dotaSlug']}")])
    if can_kick:
        rows.append([button("🚫 Удалить из пати", f"party:kick:confirm:{member['userId']}")])
    rows.append([button("← К составу пати", f"panel:{back_target}")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def kick_confirmation_keyboard(user_id: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [button("🚫 Да, удалить", f"party:kick:execute:{user_id}")],
            [button("← Отмена", "panel:member")],
        ]
    )


def registration_step_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[button("✖️ Отменить", "register:cancel")]])


def registration_roles_keyboard(selected: list[str]) -> InlineKeyboardMarkup:
    rows = []
    names = {"1": "Керри", "2": "Мид", "3": "Оффлейн", "4": "Саппорт", "5": "Хард-саппорт"}
    roles = ("1", "2", "3", "4", "5")
    for index in range(0, len(roles), 2):
        row = []
        for role in roles[index : index + 2]:
            marker = "✅ " if role in selected else ""
            row.append(button(f"{marker}{role} · {names[role]}", f"register:toggle:{role}"))
        rows.append(row)
    rows.extend(
        [
            [button("Продолжить", "register:complete")],
            [button("✖️ Отменить", "register:cancel")],
        ]
    )
    return InlineKeyboardMarkup(inline_keyboard=rows)


def account_keyboard(
    linked: bool,
    recovery_available: bool,
    profile_exists: bool = True,
    has_party: bool = False,
    has_invites: bool = False,
) -> InlineKeyboardMarkup:
    rows = [
        [button("👤 Профиль", "panel:profile"), button("🔗 Аккаунт Opinia", "account:unlink" if linked else "account:help")]
    ]
    if has_party or has_invites:
        rows.append(
            [
                *([button("👥 Моя пати", "panel:party")] if has_party else []),
                *([button("📨 Заявки", "panel:invites")] if has_invites else []),
            ]
        )
    if not profile_exists:
        rows.append([button("🆕 Создать Dota-профиль", "register:start")])
    if recovery_available:
        rows.append([button("🔐 Показать ссылку восстановления", "account:recovery")])
    rows.append([button("← В меню", "panel:home")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def button(text: str, callback_data: str) -> InlineKeyboardButton:
    return InlineKeyboardButton(text=text, callback_data=callback_data)


def button_url(text: str, url: str) -> InlineKeyboardButton:
    return InlineKeyboardButton(text=text, url=url)


def truncate(value: str, limit: int) -> str:
    return value if len(value) <= limit else f"{value[: limit - 1]}…"
