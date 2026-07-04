# Workflow разработки Opinia

Как устроена разработка проекта после выхода MVP в production.

## Текущее состояние (production)

| Компонент | Где живёт |
| --- | --- |
| **Сайт** | [https://opinia.ru](https://opinia.ru) — VPS Selectel, Docker |
| **API** | [https://api.opinia.ru](https://api.opinia.ru) — тот же VPS |
| **Chrome-расширение** | [Chrome Web Store](https://chromewebstore.google.com/) — опубликовано, у пользователей |
| **Исходный код** | [github.com/seyuwu/reviewo](https://github.com/seyuwu/reviewo) |

Backend и сайт **не** крутятся на локальной машине разработчика в повседневной работе — они на хостинге. Расширение из Store ходит на production API.

---

## Схема workflow

```text
Локальная машина                    GitHub                         Production (VPS)
─────────────────                   ──────                         ──────────────────
make dev                            git push                       git pull
localhost:3000 / :3001         →    main                    →    opinia.ru / api.opinia.ru
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

Поднимает Docker-стек: API (`localhost:3000`), web (`localhost:3001`), Postgres, Redis, MinIO. Код монтируется через bind mount — пересборка контейнеров после каждого изменения не нужна.

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

## Связанные документы

- [deployment/mvp-deploy.md](./deployment/mvp-deploy.md) — переменные окружения и production Compose
- [deployment/selectel-vds-guide.md](./deployment/selectel-vds-guide.md) — VPS Selectel, nginx, SSL
- [testing/mvp-smoke-checklist.md](./testing/mvp-smoke-checklist.md) — ручной smoke после деплоя
- [../extention.md](../extention.md) — архитектура расширения
