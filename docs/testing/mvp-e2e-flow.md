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

1. Load unpacked extension from `apps/extension/dist` in **Chrome** or **Edge**.
2. Open a known site (`found`) — floating rating card appears automatically.
3. Dismiss the card — it stays hidden until the tab is closed.
4. Open an unknown site — no floating card; use popup Home → Open page to rate.
5. Popup: search → entity → Back navigation works.
6. Sign in via header; rate from card or entity screen.

Target: rate a known site in under 5 seconds once authenticated.

## Related

- [mvp-smoke-checklist.md](./mvp-smoke-checklist.md) — broader smoke coverage
- `apps/api/src/test/integration/mvp-user-journey.integration.test.ts` — automated journey
