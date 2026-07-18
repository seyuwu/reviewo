# Welcome Flow Bot

Цель этого сервиса — не автоматизировать рекламу, а автоматизировать ответы людям, которые сами решили написать.

Это **Welcome Flow** для Telegram Business: человек пишет в ЛС → бот отвечает от твоего имени → ведёт в канал (primary) или сохраняет контакт (secondary).

## Что НЕ является целью

- Массовая рассылка
- Автоматический поиск пользователей
- Автоматический инвайт
- Рост любой ценой

Ответ людям, которые сами заинтересовались проектом.

## Что считается успехом MVP?

- 100 человек написали в ЛС
- >60% открыли канал (оценка через Telegram Analytics)
- >20% остались в канале
- >10 предложений / идей от пользователей

## Перед запуском

- Канал заполнен
- Есть аватар
- Есть описание
- Закреплённый пост
- Хотя бы 5 публикаций
- Работают все ссылки
- В Business UI бот только на «Новые чаты» / выбранные

## Docker / хостинг

**На VPS** — добавь 3 строки в уже существующий `.env.production` (не отдельный файл):

```env
WELCOME_FLOW_BOT_TOKEN=...
WELCOME_FLOW_CHANNEL_URL=https://t.me/...
WELCOME_FLOW_ADMIN_IDS=123456789
```

Пути (`DATABASE_PATH=/data/...`) трогать не нужно — volume и templates уже в образе.

```bash
docker compose --env-file .env.production --profile welcome-flow up -d --build welcome-flow-bot
```

**Локально** — секреты в `apps/welcome-flow-bot/.env` (gitignore), не в `.env.example`:

```bash
docker compose --env-file apps/welcome-flow-bot/.env --profile welcome-flow up -d --build welcome-flow-bot
```

Логи:

```bash
docker compose --profile welcome-flow logs -f welcome-flow-bot
```

Порт наружу не нужен — long polling. SQLite в volume `welcome_flow_bot_data`.

## Быстрый старт (без Docker)

1. Создай бота у [@BotFather](https://t.me/BotFather), скопируй token.
2. Скопируй `.env.example` → `.env`, заполни `WELCOME_FLOW_BOT_TOKEN`, `WELCOME_FLOW_CHANNEL_URL`, `WELCOME_FLOW_ADMIN_IDS`.
3. Установи зависимости и запусти:

```bash
cd apps/welcome-flow-bot
python -m venv .venv
# Windows:
.venv\Scripts\activate
pip install -r requirements.txt
# положить .env в apps/welcome-flow-bot или экспортировать переменные
python -m bot
```

4. Напиши боту `/start` для smoke-теста.
5. Подключи бота в Telegram: Настройки → Telegram Business → Автоматизация чатов → бот → «Новые чаты».

Deep-link для source: `https://t.me/<bot>?start=dota_chat` — попадёт в `users.source`.

## Шаблоны

Файл `templates.json`:

- Первая строка ≤ **60** символов (превью уведомления).
- Рекомендуется ≤ **250** символов, hard limit **350** после подстановки `{channel_url}`.
- Outcome first («Ищешь тиммейтов?»), без «подпишись» и без «кинь друзьям».

Пример поста в чате (message match):

> Ребят, делаю сервис для поиска тиммейтов в Dota. Собираю первых пользователей. Если интересно — напишите в ЛС, расскажу.

## Команды

- `/start` — welcome (с учётом cooldown 30 дней)
- `/stats` — метрики (только admin ids)
- `/cancel` — выйти из сбора контакта

## Метрики

События: `dm_received`, `dm_replied`, `contact_added`, `cooldown_skip`, `rate_limit_skip`.

Подписки на канал — смотри в Telegram Analytics. Клики по url-кнопке бот намеренно не считает (чтобы не ломать UX лишним шагом).

## НЕ расширять бота до

- массовых исходящих ЛС
- инвайта / парсинга участников чатов
- автопостинга в группы

Это нарушает философию Welcome Flow и повышает риск ограничений аккаунта.
