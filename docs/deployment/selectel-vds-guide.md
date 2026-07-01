Обновление в будущем:

cd /opt/opinia && git pull
docker compose --env-file .env.production \
  -f docker-compose.yml -f docker-compose.prod.yml \
  -f docker-compose.host-override.yml \
  up -d --build
Поздравляю — Opinia в проде рядом с logITika.


# Деплой Reviewo на VDS Selectel (рядом с logITika)

Пошаговый гайд для выката **Reviewo** на уже работающем сервере с **logITika** (проект 1 — не трогать).

Общая справка по production-переменным: [mvp-deploy.md](./mvp-deploy.md).

---

## Сводка окружения

| | logITika (проект 1) | Reviewo (проект 2) |
| --- | --- | --- |
| **Владелец** | nefony | nefony |
| **VPS** | Selectel, Ubuntu 24.04, `139.100.235.205`, hostname `rachelle` | тот же сервер |
| **SSH** | `ssh root@139.100.235.205` | |
| **Путь** | `/opt/logitika` | `/opt/reviewo` |
| **Git** | `git@github.com:seyuwu/logITika.git` (ветка `main`) | `git@github.com:seyuwu/reviewo.git` |
| **HTTP (loopback)** | `127.0.0.1:8888` | `127.0.0.1:8889` (web), `127.0.0.1:8890` (api) |
| **Postgres (loopback)** | `127.0.0.1:5434` | не публикуется наружу (в prod Compose) |
| **Домен** | `logitika.ru`, `www.logitika.ru` | **ваш домен** — см. раздел 4 |
| **nginx** | `/etc/nginx/sites-available/logitika` | `/etc/nginx/sites-available/reviewo` |

> **История:** старый IP `161.104.34.79` резался ТСПУ. Новый IP `139.100.235.205` чистый — logITika открывается без VPN.

---

## Что деплоим (Reviewo)

| Компонент | Где живёт |
| --- | --- |
| **Сайт (Next.js)** | Docker, порт `8889` на loopback |
| **API (NestJS)** | Docker, порт `8890` на loopback |
| **PostgreSQL** | Docker, только внутри compose-сети |
| **Redis** | Docker, чат / rate limits |
| **MinIO** | Docker, S3-хранилище |
| **Chrome-расширение** | **не на VPS** — у пользователей / Chrome Web Store |
| **Telegram-бот** | **нет** в текущем стеке |

Расширение ходит на API по HTTPS: `https://api.<ваш-домен>/...`

---

## Архитектура

```text
Интернет :443
    │
nginx (хост)
    ├─ logitika.ru / www        → 127.0.0.1:8888   (/opt/logitika)
    ├─ <домен> / www            → 127.0.0.1:8889   (Reviewo web)
    └─ api.<домен>              → 127.0.0.1:8890   (Reviewo API)

Chrome extension ──HTTPS──► api.<домен>
```

Postgres, Redis и MinIO **не публикуются** на хост (`docker-compose.prod.yml`).

---

## Что НЕЛЬЗЯ делать

- `docker compose down -v` в `/opt/logitika`
- Занимать порты **8888**, **5434**
- Редактировать `/etc/nginx/sites-available/logitika`
- Общий Postgres / общий `.env` / один compose на оба проекта
- Удалять Docker volumes с префиксом `logitika_`
- `nginx -t` failed → **не** делать `reload` (упадут оба сайта)
- Публиковать Docker-порты на `0.0.0.0` — только `127.0.0.1`

---

## 0. Перед стартом — уточните у себя

| Вопрос | Для Reviewo |
| --- | --- |
| URL репозитория | `git@github.com:seyuwu/reviewo.git` |
| Домен | например `reviewo.ru` (подставьте свой) |
| Путь compose | корень репо: `docker-compose.yml` + `docker-compose.prod.yml` |
| Сервисы в compose | `api`, `web`, `postgres`, `redis`, `minio` (+ `extension` только для сборки артефактов) |
| Порты web / API | `8889` / `8890` (зарезервированы под проект 2) |
| Telegram webhook | не нужен |

---

## 1. Проверка ресурсов VPS

```bash
ssh root@139.100.235.205

free -h
df -h
docker ps
```

**2 GB RAM на два проекта — впритык.** Reviewo в покое ~0.8–1.2 ГБ; сборка образов может временно съесть ещё 1–2 ГБ.

| Сервис Reviewo | RAM (ориентир) |
| --- | --- |
| PostgreSQL | 150–300 МБ |
| Redis | 30–80 МБ |
| MinIO | 100–200 МБ |
| API (Node) | 150–350 МБ |
| Web (Next.js) | 200–450 МБ |

### Swap (рекомендуется)

```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
free -h
```

### Проверка, что logITika жива

```bash
cd /opt/logitika && docker compose ps
curl -I http://127.0.0.1:8888/
curl -I https://logitika.ru
```

### Зарезервированные порты

```bash
ss -tlnp | grep -E '8888|8889|8890|5434'
```

---

## 2. Код и каталог

```bash
mkdir -p /opt/reviewo
cd /opt/reviewo
git clone git@github.com:seyuwu/reviewo.git .
```

Deploy key для GitHub — отдельный ключ или второй Host в `~/.ssh/config`.

```bash
cp .env.example .env.production
nano .env.production
```

---

## 3. `.env.production`

Пример (замените `<домен>`, секреты и email):

```env
COMPOSE_PROJECT_NAME=reviewo-prod
IMAGE_TAG=prod
CI=true
NODE_ENV=production

# Только loopback — снаружи заходит nginx хоста
API_PORT=8890
WEB_PORT=8889

# Публичные URL (HTTPS обязателен)
NEXT_PUBLIC_API_BASE_URL=https://api.<домен>
CORS_ALLOWED_ORIGINS=https://<домен>,https://www.<домен>,chrome-extension://ВАШ_EXTENSION_ID

# За nginx reverse proxy
TRUST_PROXY_HOPS=1

# Секреты — сгенерируйте новые
JWT_SECRET=СЛУЧАЙНАЯ_СТРОКА_МИНИМУМ_32_СИМВОЛА
POSTGRES_PASSWORD=СИЛЬНЫЙ_ПАРОЛЬ_POSTGRES
MINIO_ROOT_USER=reviewo_minio
MINIO_ROOT_PASSWORD=СИЛЬНЫЙ_ПАРОЛЬ_MINIO

POSTGRES_DB=reviewo
POSTGRES_USER=reviewo
REDIS_URL=redis://redis:6379
REPUTATION_ENGINE_ENABLED=true

# После регистрации первого админа
# ADMIN_EMAIL=you@example.com
```

Сгенерировать секрет:

```bash
openssl rand -base64 48
```

> **CORS и расширение:** в production нельзя `chrome-extension://*`. После первой установки расширения возьмите ID из `chrome://extensions` и добавьте в `CORS_ALLOWED_ORIGINS`.

> **Не коммитьте** `.env.production`.

### Привязка портов к 127.0.0.1

По умолчанию Compose может слушать `0.0.0.0`. На shared VPS создайте override **только на сервере** (не коммитьте):

`/opt/reviewo/docker-compose.host-override.yml`:

```yaml
services:
  api:
    ports:
      - "127.0.0.1:8890:8890"
  web:
    ports:
      - "127.0.0.1:8889:3000"
```

Дальше все команды compose — с тремя файлами (см. ниже).

---

## 4. DNS

A-записи на **139.100.235.205**:

| Имя | Тип |
| --- | --- |
| `<домен>` | A |
| `www.<домен>` | A |
| `api.<домен>` | A |

---

## 5. Первый деплoy

```bash
cd /opt/reviewo

# В другом терминале: watch -n 2 free -h

docker compose --env-file .env.production \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  -f docker-compose.host-override.yml \
  up -d --build
```

Или через Makefile (без host-override — добавьте `-f` в Makefile или вызывайте compose вручную):

```bash
make prod
```

Первый запуск: **10–25 минут** (сборка Node-образов).

### Проверки на сервере

```bash
docker compose --env-file .env.production \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  -f docker-compose.host-override.yml \
  ps

curl -s http://127.0.0.1:8890/health
# {"status":"ok","checks":{"database":"ok"}}

curl -I http://127.0.0.1:8889
```

Миграции БД применяются **автоматически** при старте API (`prisma migrate deploy`).

---

## 6. nginx + SSL

**Не трогайте** `/etc/nginx/sites-available/logitika`.

Создайте `/etc/nginx/sites-available/reviewo`:

```nginx
# HTTP → HTTPS + certbot
server {
    listen 80;
    server_name <домен> www.<домен> api.<домен>;
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    location / {
        return 301 https://$host$request_uri;
    }
}

# Web
server {
    listen 443 ssl http2;
    server_name <домен> www.<домен>;

    ssl_certificate     /etc/letsencrypt/live/<домен>/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/<домен>/privkey.pem;

    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:8889;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}

# API (WebSocket для чата — те же заголовки)
server {
    listen 443 ssl http2;
    server_name api.<домен>;

    ssl_certificate     /etc/letsencrypt/live/<домен>/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/<домен>/privkey.pem;

    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:8890;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 120s;
    }
}
```

### Порядок включения

1. **Сначала** временный HTTP-only конфиг (только `listen 80` + `proxy_pass`), если сертификатов ещё нет.
2. Активация:

```bash
mkdir -p /var/www/certbot
ln -sf /etc/nginx/sites-available/reviewo /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

3. Сертификат:

```bash
certbot certonly --webroot -w /var/www/certbot \
  -d <домен> -d www.<домен> -d api.<домен> \
  --email <email> --agree-tos --no-eff-email
```

4. Вставьте полный HTTPS-конфиг выше и снова:

```bash
nginx -t && systemctl reload nginx
```

---

## 7. Chrome-расширение

Расширение **не деплоится на VPS**. Соберите локально или на сервере:

```bash
cd /opt/reviewo   # или на своём ПК

EXTENSION_API_BASE_URL=https://api.<домен> \
EXTENSION_WEB_BASE_URL=https://<домен> \
NODE_ENV=production \
  corepack pnpm --filter @reviewo/extension build
```

Артефакты: `apps/extension/dist` — загрузка unpacked в Chrome или публикация в Chrome Web Store.

После установки добавьте `chrome-extension://<ID>` в `CORS_ALLOWED_ORIGINS` и перезапустите API:

```bash
docker compose --env-file .env.production \
  -f docker-compose.yml -f docker-compose.prod.yml \
  -f docker-compose.host-override.yml \
  up -d api
```

---

## 8. Финальные проверки

```bash
# logITika — ОБЯЗАТЕЛЬНО
curl -I https://logitika.ru
cd /opt/logitika && docker compose ps

# Reviewo
curl -s https://api.<домен>/health
curl -I https://<домен>
cd /opt/reviewo && docker compose --env-file .env.production \
  -f docker-compose.yml -f docker-compose.prod.yml ps
```

В браузере:

1. `https://<домен>` — главная, поиск, Trust Check  
2. Регистрация → `/profile`  
3. Страница сущности — рейтинг, отзыв, чат  

Чеклист: [../testing/mvp-smoke-checklist.md](../testing/mvp-smoke-checklist.md).

---

## 9. Назначить администратора

1. Зарегистрируйтесь на сайте.  
2. В `.env.production`: `ADMIN_EMAIL=you@example.com`  
3. Seed:

```bash
docker compose --env-file .env.production \
  -f docker-compose.yml -f docker-compose.prod.yml \
  exec api corepack pnpm --filter @reviewo/api db:seed
```

---

## 10. Обновления

| Проект | Команда |
| --- | --- |
| logITika | `cd /opt/logitika && git pull && docker compose --env-file .env up -d --build` |
| Reviewo | `cd /opt/reviewo && git pull && docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.host-override.yml up -d --build` |

**Всегда** `cd` в свою папку перед `docker compose`.

Логи Reviewo:

```bash
docker compose --env-file .env.production \
  -f docker-compose.yml -f docker-compose.prod.yml \
  logs -f api web
```

---

## 11. Бэкап PostgreSQL (Reviewo)

```bash
docker compose --env-file .env.production \
  -f docker-compose.yml -f docker-compose.prod.yml \
  exec -T postgres pg_dump -U reviewo reviewo \
  > /opt/reviewo/backups/reviewo-$(date +%F).sql
```

Cron раз в сутки + копия off-site. logITika: `/opt/logitika/scripts/backup-db.sh`.

---

## 12. Если logITika «упала» после работ над Reviewo

```bash
nginx -t                    # битый конфиг?
ss -tlnp | grep 8888        # порт свободен?
cd /opt/logitika && docker compose ps
# Не трогать volumes logitika_*
```

---

## 13. Частые проблемы

| Симптом | Что проверить |
| --- | --- |
| API не стартует (`JWT_SECRET`, `CORS`) | Все `change_me` заменены в `.env.production` |
| Сайт OK, API CORS / 404 | `NEXT_PUBLIC_API_BASE_URL` = `https://api.<домен>`; после смены — **пересобрать web** |
| `502 Bad Gateway` | Контейнеры не running или неверные порты в nginx |
| Контейнер `Killed` | OOM — swap или апгрейд тарифа |
| Чат не работает | Redis; логи `api` |
| Порт занят | `ss -tlnp`; не трогать 8888/5434 |

---

## 14. Чеклист «готов к выкату»

- [ ] DNS `<домен>`, `www`, `api` → `139.100.235.205`  
- [ ] `.env.production` с HTTPS-URL и секретами  
- [ ] Порты 8889/8890 не конфликтуют с logITika (8888/5434)  
- [ ] Docker-порты на `127.0.0.1`  
- [ ] Swap 2 ГБ (если RAM туго)  
- [ ] `curl http://127.0.0.1:8890/health` OK  
- [ ] nginx + SSL, `nginx -t` OK  
- [ ] `curl -I https://logitika.ru` OK  
- [ ] Регистрация и профиль работают  
- [ ] Бэкап БД настроен  

---

## Связанные документы

- [mvp-deploy.md](./mvp-deploy.md) — переменные окружения и production Compose  
- [../testing/mvp-smoke-checklist.md](../testing/mvp-smoke-checklist.md)  
- [../testing/mvp-e2e-flow.md](../testing/mvp-e2e-flow.md)
