# Web: Discovery, битвы и главная лента

Актуально на **2026-07-06**. Описывает текущее поведение веб-приложения и связанных API (`DiscoveryModule`, `GrowthModule`, `ChatModule`).

## Навигация и маршруты

| Маршрут | Назначение |
| ------- | ---------- |
| `/` | Главная — discovery feed (SSR) |
| `/search` | Поиск сущностей (`?q=`) |
| `/battles` | Хаб битв: активные + предложенные + ручной выбор пары |
| `/top` | Топы по рейтингу (вкладки «За неделю» / «Все время») |
| `/compare/[pairSlug]` | Сравнение двух сущностей + голосование в битве |
| `/compare` | Редирект на `/battles`, если нет query-параметров |
| `/battle/[pairSlug]` | Редирект на `/compare/[pairSlug]` |
| `/ratings` | Редирект на `/top` |
| `/entities/:id` | Страница сущности |
| `/entities/new` | Создание сущности |

**Главная (`/`):** если в URL есть `?q=...`, сервер делает redirect на `/search?q=...`.

**Шапка (`AppChrome`):** логотип | поиск по центру | ⚔️ битвы | 🔥 онлайн | 🏆 Топы | локаль | вход.

## Discovery API (backend)

Контроллер: `apps/api/src/modules/discovery/controllers/discovery.controller.ts`.

| Endpoint | Описание | Default limit | Max limit |
| -------- | -------- | ------------- | --------- |
| `GET /growth/battles/active` | Пары с голосами, по убыванию голосов | 12 | 20 |
| `GET /growth/battles/suggested` | Предложенные пары (домены → подстраницы) | 12 | 20 |
| `GET /discovery/battles/random` | Одна случайная пара | — | — |
| `GET /discovery/discussions/feed` | Каскад обсуждений | 6 | 20 |
| `GET /discovery/ratings/top?sort=week\|votes\|reliability` | Топы | 20 | 20 |
| `GET /discovery/ratings/rising?window=day` | Растущие за сутки | 20 | 20 |
| `GET /discovery/stats` | `{ activeBattles, onlineNow }` | — | — |
| `POST /discovery/presence/heartbeat` | Heartbeat посетителя сайта | body: `{ visitorId }` | — |

Голосование в битве — отдельно: `GET /growth/battle/:pairSlug`, `POST /growth/battle/:pairSlug/vote` (`GrowthCompareService`).

---

## Битвы: общая модель

- Голоса хранятся в `growth.battle_votes` (пара `pair_key` + `voter_key`, одна запись на голосующего).
- **`pair_key`** — отсортированные UUID двух сущностей через `:`.
- **`pairSlug`** в URL — `slug-left-vs-slug-right` (`buildCompareSlug`).
- **Срока битвы нет.** Пара не «заканчивается» и не снимается с ленты по времени. «Активная» = есть ≥ 1 голос; счёт копится бессрочно.
- Один посетитель — один голос на пару (анонимный `voter_key` из заголовка или JWT `userId`). Голос можно сменить (`updateVote`).
- Проценты: `leftPercent` / `rightPercent` от общего числа голосов в паре.

### Активные битвы (`getActiveBattles`)

**SQL:** группировка `growth.battle_votes` по `pair_key`, `HAVING COUNT(*) >= 1`, сортировка `COUNT(*) DESC`, затем `MAX(created_at) DESC`.

**Как «убираются» с ленты:** никак автоматически. Блок на главной **скрывается целиком**, если после загрузки список пуст (`ActiveBattlesSection` → `return null`). На `/battles` при пустом списке показывается текст «Пока нет голосов…».

Пары с удалёнными/hidden сущностями отфильтровываются при сборке DTO (`visibility !== ACTIVE`).

### Предложенные битвы (`getSuggestedBattles`)

Пары **без обязательного наличия голосов** (`isSuggested: true`). Подбор:

1. **Корневые домены** — `listTopRootEntitiesByVotes`: `parent_id IS NULL` и короткий canonical URL (только origin, без пути).
2. Если лимит не заполнен — **подстраницы** — `listTopChildEntitiesByVotes`: `parent_id IS NOT NULL` или URL с путём.
3. Внутри пула сущности идут по `votes_count DESC`, пары собираются попарно (0–1, 2–3, …), дубликаты slug отсекаются.

Если API вернул пусто — на клиенте fallback из `client-battle-fallback.ts` (хардкод для dev).

### Случайная битва (`getRandomBattle`)

Приоритет пулов и условий:

1. Корневые домены, пара **без голосов** (`totalVotes === 0`)
2. Корневые домены, любая пара
3. Подстраницы, без голосов
4. Подстраницы, любая пара

Внутри пула — случайная перестановка всех комбинаций из топ-20 сущностей пула.

**На главной:** новая пара на **каждый SSR refresh** (`loadHomeFeedData` → `fetchRandomBattleServer`). Client refetch для random battle **не** делается.

---

## Главная лента (`/`)

SSR: `loadHomeFeedData()` — параллельные запросы, затем `HomeFeedView`.

### Порядок блоков

1. Компактный поиск
2. **Случайная битва** — 1 карточка, CTA «Голосовать» → `/compare/{pairSlug}`; проценты, если `totalVotes > 0`; layout: имя | **vs** (центр) | имя
3. **Обсуждения** — см. каскад ниже
4. **Активные битвы** — до **4** пар, с процентами; «Смотреть все» → `/battles`; **секция скрыта**, если пар 0
5. **Растут сегодня** — до **6** сущностей; пусто → «Пока тихо…»
6. **Лучшие за неделю** — до **6**; пусто → «Пока тихо…»
7. **Попробуйте эти битвы** (suggested) — до **4** пар; всегда показывается (с fallback)

### Client refetch после SSR

| Секция | Refetch on mount |
| ------ | ---------------- |
| Случайная битва | Нет (только SSR) |
| Обсуждения | Да (`fetchDiscussionFeed(6)`) |
| Активные битвы | Да (`fetchActiveBattles(4)`) |
| Suggested | Да (`fetchSuggestedBattles(4)`) |
| Rising / Best week | Нет, если были SSR-данные |

### Обсуждения (`GET /discovery/discussions/feed`)

Каскад без empty state на главной:

| mode | Условие | Заголовок |
| ---- | ------- | --------- |
| `live` | ≥ 2 сообщения за **30 мин** (`getActiveNow`) | «Сейчас обсуждают» |
| `recent` | ≥ 1 сообщение за **7 дней** | «Обсуждали недавно» |
| `popular` | Топ сущностей по `votes_count` | «Обсуждали недавно» |

На главной: **6** элементов. Meta: online / число сообщений / рейтинг или «Открыть».

---

## Страница `/battles`

- **Активные:** до **12** пар, с процентами; client refetch on mount.
- **Попробуйте:** до **12** suggested; fallback при пустом ответе.
- **Compare pair picker** — ручной выбор двух сущностей → `/compare/...`.

---

## Топы (`/top`)

- Вкладки: **По надёжности** | **По голосам** (по умолчанию «По голосам»).
- API: `GET /discovery/ratings/top?sort=reliability|votes|week&limit=20`.
- **По голосам:** сортировка по `votes_count` DESC (минимум 1 оценка).
- **По надёжности:** `confidence_score` из reputation-профиля, иначе MVP-формула (голоса + отзывы); справа — «N% надёжность».
- `sort=week` остаётся для блока «Лучшие за неделю» на главной, не для `/top`.
- Legacy `window=all` мапится в `votes`.

---

## Шапка: живые цифры

`HeaderActivityNav`:

- **⚔️ N битвы** — `discovery/stats.activeBattles` = число уникальных `pair_key` с ≥ 1 голосом (не «топ-4 на главной»).
- **🔥 N онлайн** — `discovery/stats.onlineNow` = посетители сайта в Redis (`presence:site:visitors`, TTL **90 с**).
- Перед stats: `POST /discovery/presence/heartbeat` с `visitorId` из `localStorage`.
- Polling каждые **45 с**.

---

## Страница сущности (кратко)

- **Entity hero bar** — крупный заголовок, метрики, pill-навигация по секциям (чат, отзывы, сравнение…); scroll-then-highlight.
- **Отзывы** — фиксированная высота, скролл, сортировка (без блока «Лучшие отзывы»).
- **Чат** — боковая панель, locale `ru`/`en`.

---

## Деплой изменений

```bash
cd /opt/opinia && git pull
docker compose --env-file .env.production \
  -f docker-compose.yml -f docker-compose.prod.yml \
  -f docker-compose.host-override.yml \
  up -d --build
```

Миграции для этого функционала не требуются (используются существующие `battle_votes`, `entities`, chat). После деплоя — smoke: `GET /discovery/discussions/feed`, `GET /discovery/battles/random`, главная `/`.

## Связанные файлы

| Область | Пути |
| ------- | ---- |
| API discovery | `apps/api/src/modules/discovery/**` |
| API growth (vote) | `apps/api/src/modules/growth/**` |
| Web feed | `apps/web/src/features/discovery/**` |
| Web layout | `apps/web/src/components/app-chrome.tsx`, `header-activity-nav.tsx` |
| i18n | `packages/i18n/src/messages/{ru,en}.ts` → ключи `web.homeFeed.*`, `web.battlesHub.*`, `web.nav.*` |
