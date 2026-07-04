# MVP Deployment

Stage 32 production-readiness notes for the first Reviewo deployment.

For a step-by-step guide on a shared Selectel VDS (alongside another Docker project), see [selectel-vds-guide.md](./selectel-vds-guide.md).

## Prerequisites

- Docker and Docker Compose
- Node.js 20+ and Corepack-managed pnpm (for local builds without Docker)
- PostgreSQL 17+ (provided by Compose in the default stack)

## Environment files

1. Copy `.env.example` to `.env.production`.
2. Replace all `change_me` placeholders.
3. Set production values at minimum:

| Variable | Notes |
| -------- | ----- |
| `NODE_ENV` | `production` |
| `JWT_SECRET` | At least 32 characters; must not start with `change_me` |
| `POSTGRES_PASSWORD` | Strong password used by Compose Postgres |
| `DATABASE_URL` | Built automatically in Compose from Postgres vars; for external DB set explicitly on API |
| `CORS_ALLOWED_ORIGINS` | Comma-separated public web origins, e.g. `https://app.example.com` |
| `NEXT_PUBLIC_API_BASE_URL` | Public API URL embedded into the web build, e.g. `https://api.example.com` |
| `TRUST_PROXY_HOPS` | Set to the number of trusted reverse proxy hops; keep `0` when the API is directly exposed |

Optional:

| Variable | Notes |
| -------- | ----- |
| `ADMIN_EMAIL` | After a user registers, `pnpm db:seed` promotes this email to `ADMIN` |

API startup validates required production settings and fails fast on placeholders.
Production Compose also requires real `JWT_SECRET`, `POSTGRES_PASSWORD`, `MINIO_ROOT_USER`,
`MINIO_ROOT_PASSWORD`, `CORS_ALLOWED_ORIGINS`, and `NEXT_PUBLIC_API_BASE_URL` values.

## Docker Compose production stack

The production override starts API and web services. Postgres, Redis, and MinIO use the base Compose services.
The production override does not publish Postgres, Redis, or MinIO ports to the host; keep them on the
internal Compose network and put only API/web behind your reverse proxy.

```bash
# Linux / macOS
make prod

# Or explicitly
docker compose --env-file .env.production \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  up -d --build
```

Public ports (override in `.env.production`):

- API: `API_PORT` (default `3000`)
- Web: `WEB_PORT` mapped to container port `3000` (default host `3001`)

### API startup

Production API runs:

```text
prisma migrate deploy → node dist/main.js
```

Migrations apply automatically on container start. For manual runs against the dev stack:

```bash
make migrate
corepack pnpm db:migrate
```

### Seed / admin promotion

Seed does not create demo users. Register a user first, then set `ADMIN_EMAIL` and run:

```bash
make seed
corepack pnpm db:seed
```

Inside a running API container:

```bash
docker compose --env-file .env.development -f docker-compose.yml -f docker-compose.dev.yml \
  exec api corepack pnpm --filter @reviewo/api db:seed
```

## Local production build (without Compose)

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm build
```

Individual packages:

```bash
corepack pnpm --filter @reviewo/api build
NEXT_PUBLIC_API_BASE_URL=https://api.example.com corepack pnpm --filter @reviewo/web build
corepack pnpm --filter @reviewo/extension build
```

Start API after migrations:

```bash
cd apps/api
DATABASE_URL=postgresql://... JWT_SECRET=... NODE_ENV=production \
  CORS_ALLOWED_ORIGINS=https://app.example.com \
  corepack pnpm start:prod
```

Start web:

```bash
cd apps/web
corepack pnpm start
```

## Browser extension

The extension is not deployed on the VPS. **Opinia is published in the Chrome Web Store**; production builds talk to `https://api.opinia.ru` and `https://opinia.ru`.

Development workflow (local → GitHub → production): [../development-workflow.md](../development-workflow.md).

### Local development (unpacked)

Default build targets localhost:

```bash
corepack pnpm --filter @reviewo/extension build
# or watch: corepack pnpm --filter @reviewo/extension build --watch
```

Load unpacked from `apps/extension/dist` in Chrome (`chrome://extensions`).

### Production build (Chrome Web Store)

```bash
corepack pnpm --filter @reviewo/extension build:store
```

Do **not** use this output for local unpacked development — it overwrites `dist` with production URLs. Run `build:dev` afterward to switch back to localhost.

Upload the `apps/extension/dist` zip via the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole). Add `chrome-extension://<extension-id>` to `CORS_ALLOWED_ORIGINS` on the API if it changed.

Optional Compose profile to build extension artifacts inside Docker:

```bash
docker compose --env-file .env.production \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  --profile extension-artifacts build extension
```

## Health check

```bash
curl http://localhost:3000/health
```

Expect `{"status":"ok","checks":{"database":"ok"}}`.

## Logging

API uses `AppLogger` with NestJS console output. In production, log level is limited to `log`, `warn`, `error`, and `fatal` (no `debug` / `verbose`).

## Related

- [../testing/mvp-smoke-checklist.md](../testing/mvp-smoke-checklist.md)
- [../testing/mvp-e2e-flow.md](../testing/mvp-e2e-flow.md)
