from html import escape


def profile_text(profile: dict) -> str:
    roles = ", ".join(str(role) for role in profile.get("roles", [])) or "не выбраны"
    return "\n".join(
        [
            "<b>Профиль Dota 2</b>",
            f"Игрок: <b>{escape(str(profile.get('title') or '—'))}</b>",
            f"Dota ID: <b>{escape(str(profile.get('dotaAccountId') or 'не указан'))}</b>",
            f"MMR: <b>{escape(str(profile.get('mmr') or '—'))}</b>",
            f"Позиции: <b>{escape(roles)}</b>",
            f"Сервер: <b>{escape(str(profile.get('server') or '—'))}</b>",
            f"Режим подбора: <b>{escape(str(profile.get('matchMode') or 'auto'))}</b>",
            f"Поиск: <b>{'активен до ' + escape(str(profile.get('lfgExpiresAt'))) if profile.get('looking') else 'не активен'}</b>",
        ]
    )


def party_text(party: dict) -> str:
    role_names = {"1": "Керри", "2": "Мид", "3": "Оффлейн", "4": "Саппорт", "5": "Хард-саппорт"}
    lines = [f"<b>{escape(str(party.get('name') or 'Моя пати'))}</b>", ""]
    captain = next((member for member in party.get("members", []) if member.get("role") == "OWNER"), None)
    if captain:
        lines.append(f"👑 Капитан: <b>{escape(str(captain.get('displayName') or 'Игрок'))}</b>")
    for member in party.get("members", []):
        role = role_names.get(str(member.get("positionRole")), "роль не выбрана")
        mmr = member.get("mmr") or "—"
        dota_id = member.get("dotaAccountId") or "—"
        member_name = str(member.get("displayName") or "Игрок")[:40]
        lines.append(
            f"• {escape(member_name)} · {escape(role)} · {escape(str(mmr))} MMR"
            f" · Dota ID: {escape(str(dota_id))}"
        )
    open_slots = int(party.get("openSlots") or 0)
    lines.extend(["", f"Состав: {party.get('memberCount', 0)}/{party.get('maxMembers', 5)} · свободно мест: {open_slots}"])
    return "\n".join(lines)


def notification_text(payload: dict) -> str:
    invite = payload.get("invite") or {}
    name = escape(str(invite.get("partyName") or "пати"))
    player = escape(str(invite.get("inviteeDisplayName") or "игрок"))
    role = invite.get("positionRole")
    role_names = {"1": "Керри", "2": "Мид", "3": "Оффлейн", "4": "Саппорт", "5": "Хард-саппорт"}
    role_line = f"\n🎯 Позиция: {escape(role_names.get(str(role), str(role)))}" if role else ""
    event_type = payload.get("type")
    if event_type == "application_received":
        mmr = invite.get("inviteeMmr")
        mmr_line = f"\n🏅 {escape(str(mmr))} MMR" if mmr else ""
        return f"🎮 <b>Новая заявка в пати</b>\n\n<b>{name}</b>\n👤 Игрок: {player}{mmr_line}{role_line}"
    if event_type == "invite_received":
        inviter = escape(str(payload.get("inviterDisplayName") or "Игрок"))
        return (
            f"🎮 <b>Тебя приглашают в пати</b>\n\n"
            f"<b>{name}</b>\n"
            f"👤 Приглашает: {inviter}{role_line}\n\n"
            "Выбери действие кнопкой ниже."
        )
    if event_type == "accepted":
        return f"<b>Заявку в {name} приняли!</b>\nТеперь вы в пати. Откройте сайт, чтобы перейти в чат или Discord."
    if event_type == "declined":
        if invite.get("status") == "CANCELLED":
            return f"Приглашение в {name} закрыто: место уже занято или пати больше не набирает игроков."
        return f"Заявка или приглашение в {name} отклонены."
    if event_type == "member_joined":
        return f"<b>Состав {name} обновился.</b> Игрок {player} вступил в пати."
    if event_type in {"member_left", "member_kicked"}:
        party_name = escape(str(payload.get("partyName") or "пати"))
        player = escape(str(payload.get("memberDisplayName") or "Игрок"))
        action = "был удалён из пати" if event_type == "member_kicked" else "вышел из пати"
        return f"<b>Состав {party_name} обновился.</b> Игрок {player} {action}."
    return f"Обновление пати {name}."
