from datetime import datetime, timedelta, timezone
from html import escape
import uuid

from aiogram import F, Router
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup

from ..api.client import ApiError
from ..services.callbacks import acknowledge_callback
from ..services.panel import begin_panel_transition, edit_panel_content
from ..services.rewards_ui import marina_phrase, reward_photo
from ..services.temporary_notifications import send_temporary_notification

router = Router(name="rewards")


def key(text, data):
    return InlineKeyboardButton(text=text, callback_data=data)


def when(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone(timedelta(hours=3))).strftime("%d.%m %H:%M МСК")


@router.callback_query(F.data.startswith("rewards:"))
async def rewards(callback: CallbackQuery, bot, api, storage, settings, state):
    acknowledge_callback(callback)
    if callback.message is None or callback.message.chat.type != "private":
        return
    if not getattr(settings, "rewards_enabled", False):
        return
    user = callback.from_user.id
    await state.clear()
    await begin_panel_transition(bot, storage, user, callback.message.chat.id)
    parts = (callback.data or "rewards:home").split(":")
    action = parts[1]
    scene = "home"
    back = [key("← К балансу", "rewards:home")]
    try:
        page = await api.user(user, "GET", "/rewards/me")
        config = page["settings"]
        currency = escape(config["currencyName"])
        rows = []
        prefix = ""
        if action in {"home", "list"}:
            text = f"<b>{escape(config['programName'])}</b>\n\nБаланс: <b>{page['balance']} {currency}</b>\n"
            for giveaway in page.get("giveaways", [])[:5]:
                rows.append([key(f"🎁 {giveaway['title'][:70]}", f"rewards:raffle:{giveaway['id']}")])
            if not page.get("giveaways"):
                text += "\nНовый розыгрыш скоро появится. Танго можно копить уже сейчас.\n"
            rows.extend([[key("☘️ Заработать", "rewards:earn:0"), key("🧾 История", "rewards:history:0")], [key("← Главное меню", "panel:home")]])
        elif action == "earn":
            scene = "earn"
            number = max(0, min(1, int(parts[2]) if len(parts)>2 else 0))
            tasks = sorted(page["tasks"], key=lambda task: task["completed"])
            text = "<b>Заработать</b>\nВсе действия учитываются автоматически. Начисление может занять несколько минут.\n"
            for task in tasks[number*4:number*4+4]:
                status = "✅" if task["completed"] else "☘️"
                text += f"\n{status} {escape(task['title'])}: <b>+{task['amount']}</b>\n"
                if task["key"] == "daily_party" and not task["completed"]:
                    rows.append([key("Искать пати", "search:looking"), key("Собрать пати", "search:recruit")])
                elif task["key"].startswith("referral_"):
                    if not any(row[0].callback_data == "invite:friends" for row in rows):
                        rows.append([key("Моя ссылка для друзей", "invite:friends")])
                elif task["key"] in {"telegram_tag", "steam_tag"}:
                    provider = task["key"].split("_")[0]
                    verification = next((v for v in page["tags"] if v["provider"] == provider), None)
                    text += f"Тег: <code>{escape(config['tag'])}</code>\n"
                    if verification:
                        labels = {"VERIFIED":"Тег найден; награды после суток повторных проверок", "MISSING":"Тег пока не найден", "PENDING":"Ожидает проверки", "ERROR":"Проверка недоступна, повторим позже"}
                        text += labels.get(verification["status"], "На проверке") + "\n"
                    label = "Проверить имя Telegram" if provider=="telegram" else "Проверить имя Steam" if verification and verification.get("profileId") else "Подключить Steam"
                    rows.append([key(label, f"rewards:tag:{provider}")])
                    if provider=="steam" and verification and verification.get("profileId"):
                        rows.append([key("Сменить Steam", "rewards:relink:steam")])
                elif task["key"] == "profile_ready" and not task["completed"]:
                    rows.append([key("Мой аккаунт", "panel:account")])
            if len(tasks)>4:
                rows.append([key("Другие задания →" if number==0 else "← Первые задания", f"rewards:earn:{1-number}")])
            rows.append(back)
        elif action in {"tag","relink"}:
            scene = "earn"
            provider = parts[2]
            if provider not in {"telegram", "steam"}:
                raise ValueError("Unknown provider")
            result = await api.user(user, "POST", "/rewards/tags", {"provider":provider,"relink":action=="relink"})
            if result.get("url"):
                text = "<b>Подключить Steam</b>\n\nВойди на официальном сайте Steam. После подключения добавь в имя профиля тег:\n" + f"<code>{escape(config['tag'])}</code>\n\nТег проверяется автоматически. Ссылка действует 10 минут."
                rows.append([InlineKeyboardButton(text="Войти через Steam",url=result["url"])])
            else:
                title = "Тег в имени Telegram" if provider=="telegram" else "Тег в имени Steam"
                text = f"<b>{title}</b>\n\nДобавь <code>{escape(config['tag'])}</code> в имя своего профиля. Проверка уже поставлена в очередь.\n\nНаграда появляется после суток повторных проверок. Уберёшь тег — новые начисления остановятся."
            rows.append([key("← Задания", "rewards:earn:0")])
        elif action == "history":
            scene = "history"
            offset = max(0, min(10000, int(parts[2]) if len(parts)>2 else 0))
            data = page if not offset else await api.user(user,"GET",f"/rewards/me?offset={offset}")
            text = "<b>История операций</b>\n"
            # Ten compact rows keep Telegram photo captions within 1024 characters.
            for entry in data["history"][:7]:
                details = entry.get("details") or {}
                label = details.get("title") or {"tickets":"Билеты", "refund":"Возврат за отмену"}.get(entry["task"],entry["task"])
                amount = entry["amount"]
                text += f"\n{amount:+} · {escape(str(label)[:50])} · {when(entry['createdAt'])}\n"
            if not data["history"]:
                text += "\nНачислений пока нет. Выполняй задания — всё учтём автоматически.\n"
            navigation = []
            if offset:
                navigation.append(key("← Раньше",f"rewards:history:{max(0,offset-7)}"))
            if len(data["history"])>7 or data.get("hasMore"):
                navigation.append(key("Дальше →",f"rewards:history:{offset+7}"))
            if navigation:
                rows.append(navigation)
            rows.append(back)
        elif action in {"raffle", "buy", "confirm", "tickets", "rules"}:
            scene = "raffle" if action not in {"confirm","tickets"} else action
            pending = storage.get_choice(user,"reward_purchase",0) or {}
            if action == "confirm":
                if len(parts)<3 or pending.get("token") != parts[2]:
                    raise ApiError("Это подтверждение устарело. Открой розыгрыш заново.")
                giveaway_id = pending["giveaway"]
                await api.user(user,"POST",f"/rewards/giveaways/{giveaway_id}/tickets",{"requestId":pending["request"],"quantity":pending["quantity"],"expectedPrice":pending["price"]})
                prefix = "✅ Билеты куплены.\n\n"
            else:
                giveaway_id = str(uuid.UUID(parts[2]))
            giveaway = await api.user(user,"GET",f"/rewards/giveaways/{giveaway_id}")
            if action == "rules":
                full = giveaway["title"] + "\n\n" + giveaway["description"] + "\n\nПризы:\n" + "\n".join(f"• {p}" for p in giveaway["prizes"])
                for start in range(0,len(full),3500):
                    await send_temporary_notification(bot,storage,user,user,full[start:start+3500],180,parse_mode=None)
            own = giveaway["tickets"]
            text = prefix + f"<b>{escape(giveaway['title'])}</b>\n\n" + escape(giveaway["description"][:200]) + "\n"
            if action == "tickets":
                ticket_page = max(0,int(parts[3]) if len(parts)>3 else 0)
                shown = own[ticket_page*30:ticket_page*30+30]
                text = "<b>Мои билеты</b>\n\n" + (", ".join(f"№{n}" for n in shown) or "Пока нет билетов") + "\n"
                nav=[]
                if ticket_page:
                    nav.append(key("←",f"rewards:tickets:{giveaway_id}:{ticket_page-1}"))
                if len(own)>(ticket_page+1)*30:
                    nav.append(key("→",f"rewards:tickets:{giveaway_id}:{ticket_page+1}"))
                if nav: rows.append(nav)
            elif action == "buy":
                quantity = int(parts[3])
                if quantity not in {1,3,5}:
                    raise ValueError("Invalid quantity")
                cost = quantity * giveaway["ticketPrice"]
                if cost>giveaway["balance"] or len(own)+quantity>giveaway["maxTickets"]:
                    raise ApiError("Не хватает баланса или достигнут лимит билетов.")
                token = uuid.uuid4().hex[:16]
                storage.set_choices(user,"reward_purchase",[{"token":token,"request":str(uuid.uuid4()),"giveaway":giveaway_id,"quantity":quantity,"price":giveaway["ticketPrice"]}])
                text += f"\nКупить: <b>{quantity}</b>\nСтоимость: <b>{cost} {currency}</b>\nОстанется: <b>{giveaway['balance']-cost} {currency}</b>\n"
                rows.append([key("Подтвердить покупку",f"rewards:confirm:{token}")])
            else:
                text += f"\nБилет: <b>{giveaway['ticketPrice']} {currency}</b>\nТвои билеты: {len(own)}/{giveaway['maxTickets']}\nВсего билетов: {giveaway['totalTickets']}\nОкончание: {when(giveaway['endsAt'])}\n"
                if giveaway["status"]=="OPEN" and datetime.fromisoformat(giveaway["startsAt"].replace("Z","+00:00")) <= datetime.now().astimezone():
                    rows.append([key(f"Купить {q}", f"rewards:buy:{giveaway_id}:{q}") for q in (1,3,5)])
                elif giveaway["status"]=="CANCELLED":
                    text += "\nОтменён. Потраченные танго возвращаются автоматически.\n"
                elif giveaway["draw"]:
                    winners = giveaway["draw"]["winners"]
                    text += "\nИтоги:\n" + "\n".join(f"{'🎉 Твой' if winner['isMine'] else '🎟'} билет №{winner['ticketNumber']} · {escape(winner['prize'][:60])}" for winner in winners[:3]) + "\n"
                    if not winners: text += "Участников не было.\n"
                else:
                    text += "\nПриём билетов закрыт; ожидаем итогов.\n"
            rows.extend([[key("Мои билеты", f"rewards:tickets:{giveaway_id}:0"),key("Все условия и призы",f"rewards:rules:{giveaway_id}")],back])
        else:
            raise ValueError("Unknown reward screen")
        phrase_scene = "raffle" if scene in {"raffle","confirm","tickets"} else scene
        text += "\n" + marina_phrase(storage,user,config,phrase_scene)
        # Configured titles/phrases have API limits; avoid malformed HTML truncation.
        if len(text)>1024:
            text = text.rsplit("\n",1)[0]
            if len(text)>1024:
                text = f"<b>{escape(config['programName'])}</b>\n\nТекст слишком длинный. Открой условия или следующую страницу."
        screen = "rewards:" + scene
        await edit_panel_content(bot,storage,api,settings,user,screen,text,InlineKeyboardMarkup(inline_keyboard=rows),callback.message.chat.id,media_photo=reward_photo(storage,screen))
    except (ApiError, ValueError, KeyError, IndexError) as error:
        message = str(error) if isinstance(error,ApiError) else "Открой раздел заново: эта кнопка устарела."
        await edit_panel_content(bot,storage,api,settings,user,"rewards:home",f"<b>Награды</b>\n\n{escape(message[:300])}",InlineKeyboardMarkup(inline_keyboard=[[key("Попробовать снова","rewards:home")],[key("← Главное меню","panel:home")]]),callback.message.chat.id,media_photo=reward_photo(storage,"rewards:home"))
