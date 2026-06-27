# MVP Smoke Checklist

Use this checklist for manual verification when automated tests are not enough.

## One command

```bash
corepack pnpm test
```

Integration tests against a running database:

```bash
# PowerShell
$env:INTEGRATION_TESTS='true'; corepack pnpm --filter @reviewo/api test

# Bash
INTEGRATION_TESTS=true corepack pnpm --filter @reviewo/api test
```

Requires PostgreSQL reachable via API `DATABASE_URL` (Docker dev stack is enough).

End-to-end MVP journey (Stage 31) — prefer running inside the API container when host port `5432` is occupied:

```bash
docker exec -e E2E_TESTS=true reviewo-dev-api-1 sh -c "cd /workspace && corepack pnpm --filter @reviewo/api test"
```

From the host (when `DATABASE_URL` points at Reviewo Postgres on `localhost`):

```bash
# PowerShell
$env:E2E_TESTS='true'; corepack pnpm --filter @reviewo/api test

# Bash
E2E_TESTS=true corepack pnpm --filter @reviewo/api test
```

See [mvp-e2e-flow.md](./mvp-e2e-flow.md).

## Extension manual smoke

1. Load unpacked extension from `apps/extension/dist`.
2. Open a site with a known Reviewo entity → card shows rating summary.
3. Open an unknown site → card shows "Be the first to rate this site".
4. Sign in through popup → rating controls become enabled.
5. Submit rating on known site → aggregate updates without page reload.
6. Submit first rating on unknown site → card switches to found state.

## Web manual smoke

1. Open `/` → search UI loads.
2. Open `/entities/new` → creation form loads.
3. Open `/profile` → profile page loads.
4. Open `/entities/:id` for an existing entity → entity page loads.

## API manual smoke (curl-friendly)

- `GET /health`
- `GET /extension/resolve?url=...`
- `POST /auth/register` + `GET /auth/me`
- `PUT /extension/entities/by-url/my-rating` (lazy create)
- `POST /moderation/entities/:id/hide` (admin only)
