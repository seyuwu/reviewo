from datetime import datetime, timedelta, timezone
from html import escape
import uuid

from aiogram import F, Router
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

from ..api.client import ApiError
from ..services.callbacks import acknowledge_callback
from ..services.panel import begin_panel_transition, edit_panel_content
from ..services.rewards_ui import marina_phrase, reward_photo
from ..services.temporary_notifications import send_temporary_notification

router = Router(name="rewards")


class RewardSubmission(StatesGroup):
    evidence = State()


def key(text, data):
    return InlineKeyboardButton(text=text, callback_data=data)


def when(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone(timedelta(hours=3))).strftime("%d.%m %H:%M МСК")


@router.message(RewardSubmission.evidence, F.chat.type == "private", F.text & ~F.text.startswith("/"))
async def receive_task_evidence(message: Message, api, storage, settings, state):
    if not message.from_user or not getattr(settings, "rewards_enabled", False):
        return
    user = message.from_user.id
    task_key = (await state.get_data()).get("reward_task_key")
    text = (message.text or "").strip()
    keyboard = InlineKeyboardMarkup(inline_keyboard=[[key("← Задания", "rewards:earn:0")]])
    if not task_key:
        await state.clear()
        return
    if not text or len(text) > 1000:
        result_text = "Пришли описание выполнения или ссылку одним сообщением, от 1 до 1000 символов."
    else:
        try:
            result = await api.user(user, "POST", f"/rewards/tasks/{task_key}/submissions", {"evidence": text})
            await state.clear()
            result_text = "✅ Награда за этот период уже начислена." if result.get("completed") else "⏳ Заявка отправлена администратору. Сообщу, когда он её проверит."
        except ApiError as error:
            if error.status in {404,409}:
                await state.clear()
                result_text = "Условия задания изменились. Вернись в список и открой их заново."
            else:
                result_text = "Не удалось отправить подтверждение: " + escape(str(error)[:150]) + "\nПопробуй ещё раз."
    await edit_panel_content(message.bot, storage, api, settings, user, "rewards:earn", result_text,
                             keyboard, message.chat.id, media_photo=reward_photo(storage, "rewards:earn"))


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
            tasks = sorted(page["tasks"], key=lambda task: task["completed"])
            number = max(0, min(max(0, (len(tasks)-1)//3), int(parts[2]) if len(parts)>2 else 0))
            text = "<b>Заработать</b>\nАвтоматические задания считаются сами. Для ручных отправь подтверждение. Начисление может занять несколько минут.\n"
            for task in tasks[number*3:number*3+3]:
                status = "✅" if task["completed"] else "☘️"
                text += f"\n{status} {escape(task['title'][:60])}: <b>+{task['amount']}</b>\n"
                text += "<u>" + escape(task.get("description", "")[:70]) + "</u>\n"
                submission = task.get("submission")
                if submission and submission["status"] == "PENDING":
                    submitted_amount = (submission.get("rule") or {}).get("amount", task["amount"])
                    text += f"⏳ Заявка на +{submitted_amount} на проверке\n"
                rows.append([key("Условия · " + task["title"][:35], "rewards:task:" + task["key"])])
            navigation = []
            if number:
                navigation.append(key("← Назад", f"rewards:earn:{number-1}"))
            if (number+1)*3 < len(tasks):
                navigation.append(key("Другие задания →", f"rewards:earn:{number+1}"))
            if navigation:
                rows.append(navigation)
            rows.append(back)
        elif action in {"task", "submit", "conditions"}:
            scene = "earn"
            task_key = parts[2]
            task = next((task for task in page["tasks"] if task["key"] == task_key), None)
            if not task:
                raise ApiError("Задание больше не доступно. Открой список заново.")
            if action == "conditions":
                await send_temporary_notification(bot, storage, user, callback.message.chat.id,
                    f"<b>{escape(task['title'])}</b>\n\n<u>{escape(task.get('description', ''))}</u>", 120, parse_mode="HTML")
            condition = task.get("condition", task_key)
            labels = {"once":"Один раз", "day":"Раз в день, по Москве", "week":"Раз в неделю, по Москве", "friend":"За каждого нового друга"}
            text = f"<b>{escape(task['title'][:80])}</b>\n\n<u>{escape(task.get('description', '')[:420])}</u>\n\nНаграда: <b>+{task['amount']} {currency}</b>\n{labels.get(task['period'], '')}\n"
            if task["completed"] and task["period"] != "friend":
                text += "\n✅ Уже выполнено за этот период."
            elif condition == "manual":
                submission = task.get("submission")
                if submission and submission["status"] == "PENDING":
                    submitted_amount = (submission.get("rule") or {}).get("amount", task["amount"])
                    text += f"\n⏳ Заявка ждёт проверки. Награда по условиям подачи: +{submitted_amount} {currency}."
                elif action == "submit":
                    await state.set_state(RewardSubmission.evidence)
                    await state.update_data(reward_task_key=task_key)
                    text = f"<b>{escape(task['title'][:80])}</b>\n\nПришли одним сообщением описание выполнения или ссылку на подтверждение, до 1000 символов.\n\nНаграда после решения администратора: <b>+{task['amount']} {currency}</b>."
                else:
                    if submission and submission["status"] == "REJECTED":
                        text += "\nПредыдущая заявка отклонена: " + escape(str(submission.get("reason") or "")[:120])
                    rows.append([key("Отправить подтверждение", "rewards:submit:" + task_key)])
            elif condition in {"party_activity", "search_started", "party_created", "weekly_party", "party_joined"}:
                rows.append([key("Искать пати", "search:looking"), key("Собрать пати", "search:recruit")])
            elif condition in {"referral_ready", "referral_active"}:
                rows.append([key("Моя ссылка для друзей", "invite:friends")])
            elif condition == "account_ready":
                rows.append([key("Мой аккаунт", "panel:account")])
            elif condition == "telegram_tag":
                text += f"\nТег: <code>{escape(config['tag'])}</code>\nМинимум {task.get('minimumHours',24)} ч. с повторными проверками."
                verification = next((row for row in page.get("tags", []) if row["provider"] == "telegram"), None)
                if verification:
                    labels = {"PENDING":"Проверка в очереди", "VERIFIED":"Тег найден", "MISSING":"Тег пока не найден", "ERROR":"Проверка недоступна; повторим позже"}
                    text += "\n" + labels.get(verification["status"], "На проверке")
                rows.append([key("Проверить имя Telegram", "rewards:tag:telegram")])
                rows.append([key("Статус проверки", "rewards:tag-status:telegram")])
            if len(task.get("description", "")) > 420:
                rows.append([key("Полные условия", "rewards:conditions:" + task_key)])
            rows.append([key("← Задания", "rewards:earn:0")])
        elif action in {"tag", "tag-status"}:
            scene = "earn"
            if parts[2] != "telegram":
                raise ApiError("Задание Steam убрано. Открой актуальный список заданий.")
            tag = escape(config["tag"])
            text = f"<b>Тег в имени Telegram</b>\n\nДобавь <code>{tag}</code> в имя или фамилию профиля. @username не проверяется.\n\n"
            if action == "tag":
                await api.user(user, "POST", "/rewards/tags", {"provider":"telegram"})
                text += "⏳ Проверка запущена автоматически. Результат придёт отдельным сообщением. Заявка админу не требуется."
            else:
                verification = next((row for row in page.get("tags", []) if row["provider"] == "telegram"), None)
                status = (verification or {}).get("status")
                if status == "VERIFIED":
                    text += "✅ Тег найден."
                    if verification.get("firstSeenAt"):
                        text += " Наблюдение с " + when(verification["firstSeenAt"]) + "."
                    text += " Награда начислится по сроку удержания из условий задания."
                elif status == "MISSING":
                    text += "Тег не найден в имени или фамилии. После изменения имени нажми «Проверить снова»."
                elif status == "ERROR":
                    text += "⏳ Telegram временно не ответил. Повторим автоматически; можно запустить проверку снова."
                elif status == "PENDING":
                    text += "⏳ Проверка в очереди. Результат появится здесь и придёт отдельным сообщением."
                else:
                    text += "Проверка ещё не запускалась."
                if verification and verification.get("checkedAt"):
                    text += "\nПоследняя проверка: " + when(verification["checkedAt"])
                rows.append([key("Проверить снова", "rewards:tag:telegram")])
            rows.append([key("Обновить статус", "rewards:tag-status:telegram")])
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
        if scene != "earn":
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
