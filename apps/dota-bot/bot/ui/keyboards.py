from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup


def home_keyboard(
    registered: bool,
    has_party: bool,
    is_recruiting: bool = False,
    is_looking: bool = False,
) -> InlineKeyboardMarkup:
    first_label = "🔎 Ищу пати" if is_looking else "🎯 Ищу пати"
    first_action = "panel:looking" if is_looking else "search:looking"
    open_party = has_party or is_recruiting
    second_label = "👥 Моя пати" if open_party else "🧭 Набираю игроков"
    second_action = "panel:party" if open_party else "search:recruit"
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [button(first_label, first_action), button(second_label, second_action)],
            [button("👤 Аккаунт", "panel:account")],
        ]
    )


def looking_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [button("⏹ Остановить поиск", "search:stop")],
            [button("← В меню", "panel:home")],
        ]
    )


def back_keyboard(target: str = "home") -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[button("← Назад", f"panel:{target}")]])


def invite_keyboard(invite_id: str, invite_kind: str) -> InlineKeyboardMarkup:
    if invite_kind == "APPLICATION":
        buttons = [button("✅ Принять заявку", f"invite:{invite_id}:accept"), button("✖️ Отклонить", f"invite:{invite_id}:decline")]
    else:
        buttons = [button("✅ Принять", f"invite:{invite_id}:accept"), button("✖️ Отклонить", f"invite:{invite_id}:decline")]
    return InlineKeyboardMarkup(inline_keyboard=[buttons])


def recruiting_party_keyboard(party: dict, searching_roles: set[str] | None = None) -> InlineKeyboardMarkup:
    return party_keyboard(
        party,
        bool(party.get("canManageParty")),
        is_recruiting=True,
        searching_roles=searching_roles or set(),
    )


def party_keyboard(
    party: dict,
    show_search: bool,
    is_recruiting: bool = False,
    searching_roles: set[str] | None = None,
) -> InlineKeyboardMarkup:
    occupants = party_slot_occupants(party)
    searching_roles = searching_roles or set()
    roles = ("1", "2", "3", "4", "5")
    slots = [button(truncate(occupants.get(role, role), 12), f"party:slot:{role}") for role in roles]
    search_status = [
        button(
            "—" if role in occupants else ("🔎" if role in searching_roles else "FREE"),
            (
                f"party:noop:{role}"
                if role in occupants
                else f"party:searching:{role}"
            ),
        )
        for role in roles
    ]
    rows = [slots]
    if show_search and is_recruiting:
        rows.append(search_status)
    if party.get("canManageParty"):
        if is_recruiting:
            rows.append([button("⏹ Остановить набор", "search:stop")])
        else:
            rows.append([button("🔎 Начать автоподбор", "search:recruit")])
    rows.append([button("← Назад", "panel:home")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


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
