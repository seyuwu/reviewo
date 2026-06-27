# MVP End-To-End Flow

Stage 31 verifies the main Reviewo MVP journey through an automated API E2E test and a short manual extension checklist.

## Automated E2E (API)

The API test boots the full Nest application against a real PostgreSQL database and exercises the same contracts used by web and extension clients.

### Lazy-create path (extension-first)

```text
Register
  ↓
Search unknown URL → empty
  ↓
Extension resolve → not_found
  ↓
PUT /extension/entities/by-url/my-rating
  ↓
Extension resolve → found
  ↓
Search finds entity
  ↓
PUT /extension/entities/:entityId/my-rating (update)
  ↓
GET /entities/:entityId/page (composed rating)
```

### Manual-create path (web fallback)

```text
Register
  ↓
POST /entities
  ↓
PUT /ratings/entities/:entityId/my-rating
  ↓
GET /ratings/entities/:entityId
  ↓
Extension resolve → found
```

### Run

Requires the Docker dev stack with a migrated database. Integration tests boot a local Nest server and need a working `DATABASE_URL`.

**Recommended (inside Compose network):**

```bash
docker exec -e E2E_TESTS=true reviewo-dev-api-1 sh -c "cd /workspace && corepack pnpm --filter @reviewo/api test"
```

Use your Compose project prefix if it differs from `reviewo-dev`.

**From the host** (only when `localhost:5432` reaches the Reviewo Postgres instance, not another local PostgreSQL):

```bash
# PowerShell
$env:E2E_TESTS='true'
$env:DATABASE_URL='postgresql://reviewo:<password>@localhost:5432/reviewo'
corepack pnpm --filter @reviewo/api test

# Bash
E2E_TESTS=true DATABASE_URL='postgresql://reviewo:<password>@localhost:5432/reviewo' corepack pnpm --filter @reviewo/api test
```

If host port `5432` is already used by another PostgreSQL install, prefer the `docker exec` command above.

The lazy-create test also asserts that the first by-url rating completes in **under 5 seconds** on the local integration server.

Unit tests remain the default:

```bash
corepack pnpm test
```

## Manual extension checklist

Use this when validating the real browser extension UX after `apps/extension/dist` is built.

1. Load unpacked extension from `apps/extension/dist`.
2. Open an unknown site.
3. Sign in through the popup.
4. Select a 1–5 rating on the card.
5. Confirm the card switches to **found** without reloading the page.
6. Confirm average score and votes count update after rating.

Target: complete steps 3–5 in under 5 seconds once authenticated.

## Related

- [mvp-smoke-checklist.md](./mvp-smoke-checklist.md) — broader smoke coverage
- `apps/api/src/test/integration/mvp-user-journey.integration.test.ts` — automated journey
