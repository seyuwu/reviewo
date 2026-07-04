# Next Session Handoff

## Current State

Entity Live Chat is live across all three clients (2026-07-05).

Backend `ChatModule` provides REST + WebSocket chat, Redis locale-scoped presence, trust-based send cooldowns, and message retention cleanup. Extension popup chat drawer, extension rating card inline chat, and web entity page sidebar chat all share locale-separated rooms (`ru` default, `en` optional). Recent polish fixed scroll behavior, locale-switch races, web older-message loading, extension popup auth prompt import, and Next.js `/entities/*` route 404 after Docker web restart.

## Already Done (Entity Live Chat)

### Backend (2026-06-28)

- Prisma migration `20260628140000_add_entity_chat_foundation`
- `RedisModule` + `REDIS_URL` env validation
- Chat endpoints:
  - `GET /chat/entities/:entityId/messages`
  - `GET /chat/entities/:entityId/online`
  - `GET /chat/active-now`
  - `POST /chat/entities/:entityId/messages` (JWT)
  - `POST /chat/entities/:entityId/presence` (JWT)
- WebSocket namespace `/chat` events: `join`, `leave`, `send_message`, `heartbeat`, `new_message`, `online_count`
- Locale query param on REST and socket room naming via `@reviewo/shared` helpers

### Extension popup (2026-06-28 + 2026-07-04/05)

- Components: `ChatDrawer`, `ActiveNowPanel`
- Locale switch, resizable drawer, incremental DOM message list
- i18n keys under `chat.*`

### Extension rating card (2026-07-04/05)

- Inline chat section in content-script rating card (`card-chat-drawer.ts`)
- Same locale/REST/WebSocket flow as popup chat

### Web entity page (2026-07-04/05)

- `EntityChatPanel` in entity page sidebar
- Locale switch, resizable panel, REST + WebSocket, older-messages button

### Tests

- Chat unit tests: message pagination, presence, room naming, active-now ranking, trust cooldown
- Shared `@reviewo/shared` entity-chat message merge/trim helpers tested
- Extension regression tests still pass

## Before Manual Chat Smoke

1. Ensure Redis is running in dev Compose.
2. Apply migration if needed: `corepack pnpm --filter @reviewo/api db:migrate`.
3. Rebuild/reload extension dist after changes.
4. If `/entities/*` returns 404 after Docker web restart on Windows:
   ```powershell
   docker compose --env-file .env.development -f docker-compose.yml -f docker-compose.dev.yml exec web sh -c "rm -rf /workspace/apps/web/.next"
   docker compose --env-file .env.development -f docker-compose.yml -f docker-compose.dev.yml restart web
   ```

## Remaining Work (Deferred)

- Chat message moderation/hide integration with ModerationModule
- Dedicated scheduler/worker for retention instead of in-process interval
- Reactions, replies, threading, attachments, edits/deletes
- AI summaries or AI moderation
- CAPTCHA / hard rate limits

## Next Stage

None approved. Pick from Stage 33 post-MVP RFC backlog or extend chat v2 only after explicit approval.

## Documents To Read First

1. `project-management/00-current-state.md`
2. `project-management/06-changelog.md` (2026-06-28 and 2026-07-05 entries)
3. `project-management/04-decisions.md` (Entity Live Chat MVP Architecture)

## Pay Attention To

- Do not add chat room/participant tables without RFC — room id remains `{entityId}:{locale}`.
- Keep chat additive; do not merge chat state into rating/review view models.
- Redis is required for API chat presence (production must set `REDIS_URL`).
- On Windows Docker dev, clear `apps/web/.next` if Next.js stops serving `/entities/*` routes after restart.
- One pre-existing flaky API test in `reputation.service.test.ts` (`replaces vote weight...`) may fail intermittently; unrelated to chat.
