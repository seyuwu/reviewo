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
3. Open `/profile` → profile page loads; «Мои топы» section visible when signed in.
4. Open `/entities/:id` for an existing entity → entity page loads.
5. Open `/tops` → user tops hub loads.
6. Open `/tops/new` → top editor loads (sign in to publish).
7. Create a top with 3+ entities → `/tops/:slug` shows ordered list; top appears on `/profile` under «Мои топы».
8. User B forks User A's top → edit pre-filled → publish → attribution «Основан на топе»; source shows fork count.
9. Open another user's top → engagement bar shows views/likes/comments/forks; like + comment update counts.
10. On entity page, «В топах» section appears when entity is in a user top or system top.
11. Open `/top` → global leaderboard loads; catalog chips link to `/top/:systemSlug`.
12. After `pnpm system-tops:refresh`, open `/top/ai-tools` → system top page loads.
13. Open `/top` → sub-nav shows Ratings / Catalog / User tops; catalog renders cards.
14. Open `/tops` → category chips; create top with category → appears in `/tops/category/ai`; liked top ranks higher with `sort=popular`.
15. Create HYBRID top (editor → «Дополнительно» → «Сравнить с Opinia») with 3 entities of different ratings → author order differs from Opinia column on `/tops/:slug`.
16. Create SYSTEM top (editor → «Дополнительно» → «По рейтингу Opinia») with 3 entities → display order on `/tops/:slug` follows Opinia rating, not add order.
15. On entity page, suggest a description correction → two other users approve → field updates.
16. Duplicate suggestions block → propose merge → admin applies via «Применить».

## API manual smoke (curl-friendly)

- `GET /health`
- `GET /extension/resolve?url=...`
- `POST /auth/register` + `GET /auth/me`
- `POST /tops` + `PUT /tops/:id/items` + `GET /tops/:slug`
- `POST /tops/:id/fork` + `GET /tops/:id/forks`
- `POST /tops/:id/like` + `POST /tops/:id/view` + `GET/POST /tops/:id/comments`
- `GET /entities/:id/tops`
- `GET /tops/system` + `GET /tops/system/:slug` + `GET /entities/:id/system-tops`
- `pnpm system-tops:refresh` (materialize snapshots)
- `GET /tops/categories` + `GET /tops/category/:slug`
- `POST /tops` requires `categoryId`
- `POST /tops` accepts optional `rankMode=HYBRID|SYSTEM` + `systemSortKey`; `GET /tops/:slug` returns computed Opinia order for SYSTEM tops and comparison fields for HYBRID tops
- `POST /entities/:id/contributions` + `POST /contributions/:id/vote`
- `POST /admin/contributions/:id/resolve` (admin only; set `ADMIN_EMAIL` in seed or promote user)
- `PUT /extension/entities/by-url/my-rating` (lazy create)
- `POST /moderation/entities/:id/hide` (admin only)
