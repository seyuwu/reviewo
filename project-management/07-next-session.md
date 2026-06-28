# Next Session Handoff

## Current State

Entity Live Chat MVP is completed (2026-06-28).

Backend now includes `ChatModule` with REST + WebSocket chat, Redis presence, trust-based send cooldowns, and message retention cleanup. Extension popup adds an expandable chat drawer on home/entity screens plus an Active Now panel on home. Existing ratings, reviews, reputation, lazy entity creation, content hiding, and extension resolve flows were not modified in behavior.

## Already Done (Entity Live Chat MVP)

- Prisma migration `20260628140000_add_entity_chat_foundation`
- `RedisModule` + `REDIS_URL` env validation
- Chat endpoints:
  - `GET /chat/entities/:entityId/messages`
  - `GET /chat/entities/:entityId/online`
  - `GET /chat/active-now`
  - `POST /chat/entities/:entityId/messages` (JWT)
- WebSocket namespace `/chat` events: `join`, `leave`, `send_message`, `heartbeat`, `new_message`, `online_count`
- Extension popup components: `ChatDrawer`, `ActiveNowPanel`
- i18n keys under `chat.*`
- Unit tests for chat service, presence, gateway room naming, chat rate limiter
- Extension regression tests still pass (`PopupNavigation`, reviews, rating card formatting)

## Before First Manual Chat Smoke

1. Ensure Redis is running in dev Compose (already in stack).
2. Apply migration: `corepack pnpm --filter @reviewo/api db:migrate` inside API container or local env.
3. Rebuild/reload extension dist after `pnpm --filter @reviewo/extension build`.
4. Open popup on a resolved entity → `↑ Обсуждение` → send message while signed in.

## Remaining Work (Deferred)

- Chat message moderation/hide integration with ModerationModule
- Dedicated scheduler/worker for retention instead of in-process interval
- Web entity page chat UI (extension-only in this stage)
- Reactions, replies, threading, attachments, edits/deletes
- AI summaries or AI moderation
- CAPTCHA / hard rate limits

## Next Stage

None approved. Pick from Stage 33 post-MVP RFC backlog or extend chat v2 only after explicit approval.

## Documents To Read First

1. `project-management/00-current-state.md`
2. `project-management/06-changelog.md` (2026-06-28 entry)
3. `project-management/04-decisions.md` (Entity Live Chat MVP Architecture)

## Pay Attention To

- Do not add chat room/participant tables without RFC — room id remains `entityId`.
- Keep chat additive; do not merge chat state into rating/review view models.
- Redis is now required for API chat presence (production must set `REDIS_URL`).
- One pre-existing flaky API test in `reputation.service.test.ts` (`replaces vote weight...`) may fail intermittently; unrelated to chat.
