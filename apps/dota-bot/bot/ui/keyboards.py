from urllib.parse import quote

from aiogram.types import CopyTextButton, InlineKeyboardButton, InlineKeyboardMarkup, LoginUrl


def home_keyboard(
    registered: bool,
    has_party: bool,
    is_recruiting: bool = False,
    is_looking: bool = False,
    site_url: str = "https://dota.opinia.ru",
    can_share: bool = False,
    registration_pending: bool = False,
) -> InlineKeyboardMarkup:
    first_label = "🔎 Ищу пати" if is_looking else "🎯 Ищу пати"
    first_action = "panel:looking" if is_looking else "search:looking"
    open_party = has_party or is_recruiting
    second_label = "👥 Моя пати" if open_party else "🧭 Собрать пати"
    second_action = "panel:party" if open_party else "search:recruit"
    rows = []
    if not registered or registration_pending:
        rows.append([button("▶️ Продолжить регистрацию", "register:resume") if registration_pending
                     else button("🚀 Зарегистрироваться", "register:start")])
    rows.append([button(first_label, first_action), button(second_label, second_action)])
    rows.append([button("👤 Аккаунт", "panel:account")])
    tournaments_url = site_url.rstrip("/")
    if tournaments_url == "https://dota.opinia.ru":
        tournaments_url = "https://games.opinia.ru"
    rows.append([button_url("🏆 Турниры", f"{tournaments_url}/games/tournaments")])
    if can_share:
        rows.append([button("🔗 Пригласить друзей", "invite:friends")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def onboarding_keyboard(site_url: str = "https://dota.opinia.ru") -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [button("Создать аккаунт", "onboarding:register")],
            [button_url("🌐 Войти через сайт", f"{site_url.rstrip('/')}/telegram/connect?from=bot")],
            [button("← Назад", "panel:home")],
        ]
    )


def admin_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [button("✉️ Создать рассылку", "admin:broadcast:new")],
            [button("👤 Написать игроку", "admin:broadcast:user")],
            [button("👋 Сообщение после регистрации", "admin:registration")],
            [button("🔄 Обновить статистику", "admin:refresh")],
        ]
    )


def admin_compose_keyboard(back_to_preview: bool = False) -> InlineKeyboardMarkup:
    rows = []
    if back_to_preview:
        rows.append([button("← К предпросмотру", "admin:broadcast:preview")])
    rows.append([button("← Отмена", "admin:cancel")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def admin_preview_keyboard(has_photo: bool = False, page: int = 0, page_count: int = 1,
                           *, registration: bool = False, direct: bool = False) -> InlineKeyboardMarkup:
    rows = []
    navigation = []
    if page > 0:
        navigation.append(button("← Текст", f"admin:broadcast:page:{page - 1}"))
    if page + 1 < page_count:
        navigation.append(button("Текст →", f"admin:broadcast:page:{page + 1}"))
    if navigation:
        rows.append(navigation)
    rows.extend([
        [button("💾 Сохранить и включить" if registration else "📨 Написать игроку" if direct else "📨 Отправить всем",
                "admin:registration:save" if registration else "admin:broadcast:send")],
        [button("🧪 Отправить тест себе", "admin:broadcast:test")],
        [button("✏️ Изменить текст", "admin:broadcast:edit")],
        [button("🖼 Заменить картинку" if has_photo else "🖼 Добавить картинку", "admin:broadcast:photo")],
    ])
    if has_photo:
        rows.append([button("✖ Убрать картинку", "admin:broadcast:photo:remove")])
    rows.extend([
        [button("⏱ Изменить срок удаления", "admin:broadcast:duration")],
        [button("← Отмена", "admin:cancel")],
    ])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def admin_registration_notice_keyboard(has_content: bool, enabled: bool) -> InlineKeyboardMarkup:
    rows = [[button("✏️ Изменить сообщение" if has_content else "➕ Настроить сообщение", "admin:registration:edit")]]
    if has_content:
        rows.append([button("👁 Посмотреть и настроить", "admin:registration:preview")])
    if enabled:
        rows.append([button("⏹ Отключить отправку", "admin:registration:disable")])
    if has_content:
        rows.append([button("🗑 Убрать сообщение", "admin:registration:remove")])
    rows.append([button("← В админку", "admin:cancel")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def admin_broadcast_duration_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [button("1 мин", "admin:broadcast:ttl:60"), button("10 мин", "admin:broadcast:ttl:600")],
            [button("1 час", "admin:broadcast:ttl:3600"), button("6 часов", "admin:broadcast:ttl:21600")],
            [button("24 часа", "admin:broadcast:ttl:86400"), button("Своё время", "admin:broadcast:ttl:custom")],
            [button("← Отмена", "admin:cancel")],
        ]
    )


def broadcast_delete_keyboard(campaign_id: int | None = None) -> InlineKeyboardMarkup:
    callback_data = f"broadcast:delete:{campaign_id}" if campaign_id is not None else "broadcast:delete:test"
    return InlineKeyboardMarkup(
        inline_keyboard=[[button("🗑 Удалить это сообщение", callback_data)]]
    )


def looking_keyboard(all_roles: bool = False) -> InlineKeyboardMarkup:
    rows = []
    if not all_roles:
        rows.append([button("🔎 Поиск по всем ролям", "search:all_roles")])
    rows.extend([
        [button("⏹ Остановить поиск", "search:stop")],
        [button("← В меню", "panel:home")],
    ])
    return InlineKeyboardMarkup(
        inline_keyboard=rows
    )


def solo_search_confirmation_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [button("✅ Да, продолжить поиск", "search:looking:confirm")],
            [button("← Остаться в пати", "search:looking:cancel")],
        ]
    )


def back_keyboard(target: str = "home") -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[button("← Назад", f"panel:{target}")]])


def profile_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [button("✏️ Изменить", "profile:edit")],
            [button("← Назад", "panel:home")],
        ]
    )


def profile_edit_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [button("✏️ Имя", "profile:edit:field:name")],
            [button("🎮 Dota ID", "profile:edit:field:dota-id")],
            [button("🏅 MMR", "profile:edit:field:mmr")],
            [button("🎯 Позиции", "profile:edit:field:roles")],
            [button("← К профилю", "profile:edit:cancel")],
        ]
    )


def profile_edit_field_keyboard(*, return_screen: str = "profile") -> InlineKeyboardMarkup:
    if return_screen == "account":
        return InlineKeyboardMarkup(inline_keyboard=[[button("← К аккаунту", "profile:edit:cancel")]])
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [button("← К параметрам", "profile:edit")],
            [button("✖️ К профилю", "profile:edit:cancel")],
        ]
    )


def profile_edit_roles_keyboard(selected: list[str], *, return_screen: str = "profile") -> InlineKeyboardMarkup:
    rows = []
    names = {"1": "Керри", "2": "Мид", "3": "Оффлейн", "4": "Саппорт", "5": "Хард-саппорт"}
    roles = ("1", "2", "3", "4", "5")
    for index in range(0, len(roles), 2):
        row = []
        for role in roles[index : index + 2]:
            marker = "✅ " if role in selected else ""
            row.append(button(f"{marker}{role} · {names[role]}", f"profile:edit:role:toggle:{role}"))
        rows.append(row)
    rows.append([button("💾 Сохранить позиции", "profile:edit:roles:save")])
    if return_screen == "account":
        rows.append([button("← К аккаунту", "profile:edit:cancel")])
    else:
        rows.extend([
            [button("← К параметрам", "profile:edit")],
            [button("✖️ К профилю", "profile:edit:cancel")],
        ])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def invite_keyboard(invite_id: str, invite_kind: str) -> InlineKeyboardMarkup:
    if invite_kind == "APPLICATION":
        buttons = [button("✅ Принять заявку", f"invite:{invite_id}:accept"), button("✖️ Отклонить", f"invite:{invite_id}:decline")]
    else:
        buttons = [button("✅ Принять", f"invite:{invite_id}:accept"), button("✖️ Отклонить", f"invite:{invite_id}:decline")]
    return InlineKeyboardMarkup(inline_keyboard=[buttons])


def party_keyboard(
    party: dict,
    show_search: bool,
    searching_roles: set[str] | None = None,
    site_url: str | None = None,
    web_access_url: str | None = None,
) -> InlineKeyboardMarkup:
    occupants = party_slot_occupants(party)
    searching_roles = searching_roles or set()
    roles = ("1", "2", "3", "4", "5")
    slots = [button(truncate(occupants.get(role, role), 12), f"party:slot:{role}") for role in roles]
    search_status = [
        button(
            "—" if role in occupants else ("Ищем…" if role in searching_roles else "Искать"),
            (
                f"party:noop:{role}"
                if role in occupants
                else (f"party:toggle-search:{role}" if show_search else "party:readonly")
            ),
        )
        for role in roles
    ]
    rows = [slots, search_status]
    available_roles = set(roles) - occupants.keys()
    if show_search and available_roles - searching_roles:
        rows.append([button("🔎 Искать на всех свободных", "party:search-all")])
    if site_url and party.get("slug"):
        if web_access_url:
            rows.append([button_url("💬 Чат и Discord", web_access_url)])
        else:
            next_path = f"/dota/teams/{party['slug']}"
            login_url = f"{site_url.rstrip('/')}/telegram/access?next={quote(next_path, safe='')}"
            rows.append([button_login("💬 Чат и Discord", login_url)])
    rows.append([button("🔗 Пригласить по ссылке", "party:share")])
    if party.get("canManageParty"):
        rows.append([button("⏹ Остановить набор", "search:stop")])
    if party.get("isOwner"):
        rows.append([button("🗑 Удалить пати", "party:delete:confirm")])
    else:
        rows.append([button("🚪 Покинуть пати", "party:leave:confirm")])
    rows.append([button("← Назад", "panel:home")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def party_invitation_keyboard(code: str, available_roles: list[str], needs_account_link: bool) -> InlineKeyboardMarkup:
    names = {"1": "1 · Керри", "2": "2 · Мид", "3": "3 · Оффлейн", "4": "4 · Саппорт", "5": "5 · Хард-саппорт"}
    rows = []
    if needs_account_link:
        rows.append([button("🔗 Уже есть аккаунт Opinia", f"partyinvite:link:{code}")])
    rows.extend([[button(names[role], f"partyinvite:join:{code}:{role}")] for role in available_roles if role in names])
    rows.append([button("← В меню", "panel:home")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def party_invitation_copy_keyboard(invitation_text: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text="📋 Скопировать текст", copy_text=CopyTextButton(text=invitation_text))]]
    )


def bot_invitation_copy_keyboard(invitation_text: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="📋 Скопировать текст",
                    copy_text=CopyTextButton(text=invitation_text),
                ),
            ]
        ]
    )


def party_invitation_retry_keyboard(code: str, role: str, recovery_url: str | None = None) -> InlineKeyboardMarkup:
    rows = [[button("🔄 Повторить вступление", f"partyinvite:join:{code}:{role}")]]
    if recovery_url:
        rows.insert(0, [button_url("🔐 Сохранить ссылку восстановления", recovery_url)])
    rows.append([button("← В меню", "panel:home")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def delete_party_confirmation_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [button("🗑 Да, удалить пати", "party:delete:execute")],
            [button("← Отмена", "panel:party")],
        ]
    )


def leave_party_confirmation_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [button("🚪 Да, покинуть пати", "party:leave:execute")],
            [button("← Отмена", "panel:party")],
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


def registration_mmr_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [button("Нет рейтинга · 0 MMR", "register:mmr:unranked")],
        [button("✖️ Отменить", "register:cancel")],
    ])


def registration_dota_id_keyboard(has_current_id: bool = False) -> InlineKeyboardMarkup:
    label = "Оставить текущий ID" if has_current_id else "Пропустить пока"
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [button(label, "register:dota-id:skip")],
            [button("✖️ Отменить", "register:cancel")],
        ]
    )


def registration_name_keyboard(allow_cancel: bool = True, *, use_telegram_name: bool = True) -> InlineKeyboardMarkup:
    rows = []
    if use_telegram_name:
        rows.append([button("👤 Использовать имя Telegram", "register:name:telegram")])
    if allow_cancel:
        rows.append([button("✖️ Отменить", "register:cancel")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def registration_roles_keyboard(selected: list[str], *, editing: bool = False) -> InlineKeyboardMarkup:
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
            [button("Сохранить профиль" if editing else "Создать профиль", "register:complete")],
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
    profile_url: str | None = None,
    site_url: str = "https://dota.opinia.ru",
) -> InlineKeyboardMarkup:
    if linked:
        account_button = (
            button_url("🔗 Аккаунт FDP", profile_url)
            if profile_url
            else button("🔗 Аккаунт FDP", "account:open")
        )
    else:
        account_button = button_url("🌐 Войти через сайт", f"{site_url.rstrip('/')}/telegram/connect?from=bot")
    rows = [
        [
            button("👤 Профиль", "panel:profile"),
            account_button,
        ]
    ]
    if linked and profile_exists:
        rows.extend([
            [button("✏️ Изменить имя", "account:edit:field:name"), button("🏅 Изменить MMR", "account:edit:field:mmr")],
            [button("🎯 Изменить роли", "account:edit:field:roles"), button("🎮 Изменить Dota ID", "account:edit:field:dota-id")],
        ])
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


def button_login(text: str, url: str) -> InlineKeyboardButton:
    return InlineKeyboardButton(text=text, login_url=LoginUrl(url=url))


def truncate(value: str, limit: int) -> str:
    return value if len(value) <= limit else f"{value[: limit - 1]}…"
