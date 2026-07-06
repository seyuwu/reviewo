# Next Session Handoff

## Current State

Web Discovery & IA is live in production path (2026-07-06).

Home page is a discovery feed with random battle, discussion cascade, active/suggested battles, and rating highlights. Header shows live battle-pair count and site online visitors. Battles hub, tops page, and compare flow are the primary growth surfaces. Entity page has hero bar polish and review panel UX improvements.

**Primary reference:** `docs/product/web-discovery-and-battles.md`

## Already Done (Web Discovery)

### Backend

- `DiscoveryModule` with endpoints for battles (active/suggested/random), discussion feed cascade, ratings (top/rising), stats, site presence heartbeat.
- Suggested/random battles prefer root-domain entities, fall back to child/page entities.
- Discussion feed: live (30 min, 2+ msgs) → recent (7 d, 1+ msg) → popular entities.
- Active battle count = distinct `pair_key` rows in `growth.battle_votes` with ≥ 1 vote; no battle TTL.

### Web

- IA: `/`, `/search`, `/battles`, `/top`, `/compare/[pairSlug]`.
- Home feed SSR + selective client refetch (see product doc for per-section limits).
- Header activity nav with 45s polling.
- Entity hero bar, reviews scroll/sort.

## Before Manual Smoke

1. API running with Redis (presence).
2. After backend changes: `docker compose ... restart api` (dev) or prod rebuild.
3. If `/entities/*` 404 on Windows Docker web: clear `apps/web/.next` and restart web.

## Remaining Work (Deferred)

- Battle seasons / time windows (not implemented; battles are permanent today).
- Rising/best-week popular fallback when empty (home still shows "quiet" for those sections).
- Chat v2, moderation integration, dedicated retention worker.
- Post-MVP RFC backlog (Stage 33).

## Documents To Read First

1. `docs/product/web-discovery-and-battles.md`
2. `project-management/00-current-state.md`
3. `project-management/06-changelog.md` (2026-07-06 entry)

## Pay Attention To

- Home active battles section renders **nothing** when the active list is empty (not an error state).
- Random battle changes only on **full page SSR refresh**, not on client navigation alone.
- Header "N битвы" is total active **pairs** in DB, not the 4 shown on home.
- `corepack pnpm --filter @reviewo/i18n build` after i18n key changes.
