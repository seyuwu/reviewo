# In Progress

## Current Stage

No active implementation stage.

Stage 1 - Monorepo Initialization is completed.

Stage 2 - TypeScript And Tooling Setup is completed.

Roadmap update: Docker Infrastructure is now Stage 3 and will be implemented after Stage 2.

Stage 3 - Docker Infrastructure is completed.

Stage 4 - Shared Packages is completed.

Stage 5 - Backend Skeleton is completed.

Stage 6 - Database Infrastructure is completed.

Stage 7 - Backend Error And Response Foundation is completed.

Stage 8 - Users/Auth MVP Foundation is completed.

Stage 9 - Entities Module is completed.

Stage 10 - URL Normalization MVP is completed.

Stage 11 - Ratings Module is completed.

Stage 12 - Reviews Module is completed.

Stage 13 - Trust Module MVP is completed.

Stage 14 - Backend Domain Events MVP is completed.

Infrastructure optimization - Docker Dev Volumes is completed.

Stage 15 - Search Module MVP is completed.

Stage 16 - Entity Page API Composition is completed.

Stage 17 - Extension API MVP is completed.

Stage 18 - Frontend Skeleton is completed.

Stage 19 - Web Home And Search is next, pending explicit user confirmation.

## Goal

Prepare Web Home And Search after user confirmation.

## Files To Create

To be confirmed before Stage 19 implementation.

## Files To Change

To be confirmed before Stage 19 implementation.

## Architectural Decisions For This Stage

- Stage 19 should implement the main web home/search UX after user confirmation.
- Home page should search through backend Search API.
- UI must not contain search business logic.
- Keep `fetch` out of components.
- Do not add entity creation flow or entity pages in Stage 19 unless explicitly confirmed.

## Tasks

- [ ] Wait for user confirmation to start Stage 19.
- [ ] Confirm exact Web Home And Search scope before implementation.
- [ ] Describe Stage 19 goal, files, and architectural decisions before editing.
- [ ] Implement Web Home And Search only.
- [ ] Verify frontend/backend lint/typecheck/build behavior.

## Current Progress

Stage 18 is complete. Stage 19 has not started.

## Open Questions

Stage 19 requires confirmation of exact Web Home And Search scope before implementation.

## Blockers

None.

## Remaining Work

- Wait for user confirmation before Stage 19.
- Confirm search UI contract and client behavior.
- Do not add entity creation pages, entity detail pages, auth UI, ratings UI, or extension UI until their dedicated stages.
