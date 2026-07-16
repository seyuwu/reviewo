# Workflow разработки Opinia

Как устроена разработка проекта после выхода MVP в production.

## Текущее состояние (production)

| Компонент | Где живёт |
| --- | --- |
| **Сайт (OpinIA)** | [https://opinia.ru](https://opinia.ru) — VPS Selectel, Docker |
| **Games** | [https://games.opinia.ru](https://games.opinia.ru) — тот же Next.js |
| **Dota** | [https://dota.opinia.ru](https://dota.opinia.ru) — тот же Next.js |
| **API** | [https://api.opinia.ru](https://api.opinia.ru) — тот же VPS |
| **Chrome-расширение** | [Chrome Web Store](https://chromewebstore.google.com/) — опубликовано, у пользователей |
| **Исходный код** | [github.com/seyuwu/reviewo](https://github.com/seyuwu/reviewo) |

Backend и сайт **не** крутятся на локальной машине разработчика в повседневной работе — они на хостинге. Расширение из Store ходит на production API.

---

## Хосты Games / Dota (важно при разработке)

Один Next.js (`apps/web`) обслуживает несколько публичных хостов. Отдельных контейнеров для Games/Dota нет.

| Хост | Поведение |
| --- | --- |
| `opinia.ru` / `www` | Основной продукт (рейтинги, битвы, топы) |
| `games.opinia.ru` | `/` → `/games/search` (middleware) |
| `dota.opinia.ru` | `/` → `/games/search` (middleware) |
| `api.opinia.ru` | Nest API |

### Middleware (`apps/web/src/middleware.ts`)

- На **apex** (`opinia.ru` / `www`): пути `/games*` и `/dota*` **редиректят** на `games.opinia.ru` / `dota.opinia.ru` с тем же path.
- На **games.** / **dota.**: только `/` уходит на `/games/search`.
- Локально (`localhost`) канонические редиректы на поддомены **не** включаются — можно работать по путям `/games/...`, `/dota/...` на `http://localhost:3001`.

### Shared login

Сессия шарится между `opinia.ru`, `games.opinia.ru`, `dota.opinia.ru` через cookie `Domain=.opinia.ru` (`opinia.sharedAuth` / `opinia.webSignedOut`) + localStorage. API по-прежнему принимает `Authorization: Bearer`.

Код: `apps/web/src/features/auth/lib/auth-session-cookie.ts`, `auth-session-storage.ts`.

Локально cookie domain — `.localhost` (если браузер его принимает); иначе сессия остаётся origin-local на `:3001`.

### CORS (production)

В `.env.production` на VPS **обязательно** все web-origins:

```env
CORS_ALLOWED_ORIGINS=https://opinia.ru,https://www.opinia.ru,https://games.opinia.ru,https://dota.opinia.ru,chrome-extension://<EXTENSION_ID>
```

Без `games` / `dota` браузер режет API с поддоменов (`CORS Missing Allow Origin`). После правки — `up -d api` (rebuild web не нужен).

Хелперы ссылок: `apps/web/src/lib/config/product-hosts.ts` (`getGamesHomeUrl`, `getDotaHomeUrl`, `getOpiniaHomeUrl`, `getDotaPublicOrigin`). На production entry ведёт на поддомены; **share/canonical/OG для Dota** всегда через `https://dota.opinia.ru/...` (`apps/web/src/features/dota/lib/share.ts`). На localhost — тот же origin, что `NEXT_PUBLIC_SITE_URL`.

### Entry UX с главной

С `opinia.ru`: intent-prompt и quick nav ведут на `games.opinia.ru` / `dota.opinia.ru`. Переключатель бренда «Opinia» с games/dota-хостов — на `https://opinia.ru/`.

---

## Схема workflow

```text
Локальная машина                    GitHub                         Production (VPS)
─────────────────                   ──────                         ──────────────────
make dev                            git push                       git pull
localhost:3000 / :3001         →    main                    →    opinia.ru / games. / dota. / api.
расширение unpacked (dist)          история и бэкап                docker compose up -d --build
pnpm test / lint                    (источник правды)              Chrome Web Store (новая версия)
```

**Коротко:** разрабатываю локально → пушу на GitHub → на сервере подтягиваю и проверяю на production. Расширение для пользователей — отдельная сборка с production URL и загрузка в Chrome Web Store.

---

## 1. Локальная разработка

### Backend и сайт

```bash
make dev
```

Поднимает Docker-стек: API (`localhost:3000`), web (`localhost:3001`), Postgres, Redis, MinIO. Код монтируется через bind mount (`docker-compose.dev.yml`). На Windows Docker file events с диска `E:\` не доходят до контейнера — для hot reload включён polling (см. `project-management/05-known-issues.md`). Пересборка контейнеров после каждого изменения кода не нужна.

Полезные команды:

```bash
make migrate    # применить миграции Prisma
make test       # unit/integration тесты
make lint       # ESLint
make typecheck  # TypeScript
```

Подробнее про Docker: `.cursor/rules/docker-dev-workflow.mdc`.

### Расширение (локально)

**Важно:** папка `apps/extension/dist` одна на все сборки. Если вы недавно собирали версию для Chrome Web Store (`build:store`), в `dist` лежит production-сборка с `api.opinia.ru` — unpacked будет вести себя как Store-версия. Перед локальной разработкой всегда пересоберите dev:

```bash
corepack pnpm --filter @reviewo/extension build:dev
# watch:
corepack pnpm --filter @reviewo/extension dev
```

Dev-сборка:
- имя в Chrome: **Opinia (Dev)** (отличие от Store)
- API: `http://localhost:3000`
- web: `http://localhost:3001`

Артефакты — `apps/extension/dist`. В конце сборки в терминале печатается режим (`DEVELOPMENT` или `PRODUCTION`) и URL — проверяйте их.

Установка для разработки:

1. Chrome → `chrome://extensions`
2. **Отключите** расширение Opinia из Chrome Web Store (иначе на страницах могут работать оба)
3. Режим разработчика → **Загрузить распакованное**
4. Папка `apps/extension/dist` — в списке должно быть **Opinia (Dev)**, не просто Opinia

После изменений нажмите **Обновить** на карточке dev-расширения.

#### Сборка для Store (отдельно)

```bash
corepack pnpm --filter @reviewo/extension build:store
```

Zip из `dist` → Chrome Web Store. После этого снова `build:dev`, если продолжаете локальную разработку.

---

## 2. GitHub

Репозиторий — единственный источник правды для кода и деплоя на VPS.

Типичный цикл перед пушем:

```bash
make test
make lint
make typecheck
git add …
git commit -m "…"
git push origin main
```

На GitHub хранится история; CI-пайплайн в репозитории пока минимален — основная проверка: локальные тесты + ручной smoke на production после деплоя.

---

## 3. Деплой backend и сайта на VPS

На сервере (путь `/opt/opinia`):

```bash
cd /opt/opinia && git pull
docker compose --env-file .env.production \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  -f docker-compose.host-override.yml \
  up -d --build
```

Пошаговый гайд первого выката и nginx: [deployment/selectel-vds-guide.md](./deployment/selectel-vds-guide.md).

Проверки после деплоя:

```bash
curl -s https://api.opinia.ru/health
curl -I https://opinia.ru
```

Чеклист: [testing/mvp-smoke-checklist.md](./testing/mvp-smoke-checklist.md).

---

## 4. Публикация новой версии расширения

Расширение **не** деплоится на VPS. Для Store нужна production-сборка:

```bash
EXTENSION_API_BASE_URL=https://api.opinia.ru \
EXTENSION_WEB_BASE_URL=https://opinia.ru \
NODE_ENV=production \
  corepack pnpm --filter @reviewo/extension build
```

Артефакты: `apps/extension/dist` — zip и загрузка в [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).

После первой установки unpacked-версии (или обновления manifest) проверьте, что `chrome-extension://<ID>` есть в `CORS_ALLOWED_ORIGINS` на API и перезапустите контейнер `api`.

---

## 5. Два режима расширения

| Режим | API | Web | Как установить |
| --- | --- | --- | --- |
| **Разработка** | `http://localhost:3000` | `http://localhost:3001` | Unpacked из `dist` после обычной/watch-сборки |
| **Production** | `https://api.opinia.ru` | `https://opinia.ru` | Chrome Web Store (или unpacked после production-сборки) |

Не смешивайте: Store-версия не должна указывать на localhost; dev-unpacked не заменяет проверку production-сборки перед публикацией.

---

## 6. System tops refresh

После миграций или для обновления материализованных системных топов:

```bash
docker exec reviewo-dev-api-1 corepack pnpm system-tops:refresh
```

В dev можно включить refresh при старте API: `SYSTEM_TOPS_REFRESH_ON_STARTUP=true` в `.env.development`.

В production — cron раз в час, например:

```cron
0 * * * * cd /path/to/reviewo/apps/api && corepack pnpm system-tops:refresh >> /var/log/reviewo-system-tops.log 2>&1
```

---

## Связанные документы

- [deployment/mvp-deploy.md](./deployment/mvp-deploy.md) — переменные окружения и production Compose
- [deployment/selectel-vds-guide.md](./deployment/selectel-vds-guide.md) — VPS Selectel, nginx, SSL
- [testing/mvp-smoke-checklist.md](./testing/mvp-smoke-checklist.md) — ручной smoke после деплоя
- [../extention.md](../extention.md) — архитектура расширения
