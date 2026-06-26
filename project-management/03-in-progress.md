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

Stage 17 - Extension API MVP is next, pending explicit user confirmation.

## Goal

Prepare Extension API MVP after user confirmation.

## Files To Create

To be confirmed before Stage 17 implementation.

## Files To Change

To be confirmed before Stage 17 implementation.

## Architectural Decisions For This Stage

- Stage 17 should provide the minimum API required by the browser extension after user confirmation.
- Extension API should support resolving an object by URL and quick rating.
- Backend remains the only source of business logic.
- Do not add browser extension UI code in Stage 17 unless explicitly confirmed.

## Tasks

- [ ] Wait for user confirmation to start Stage 17.
- [ ] Confirm exact Extension API contracts before implementation.
- [ ] Describe Stage 17 goal, files, and architectural decisions before editing.
- [ ] Implement Extension API MVP only.
- [ ] Verify backend lint/typecheck/build and extension API behavior.

## Current Progress

Stage 16 is complete. Stage 17 has not started.

## Open Questions

Stage 17 requires confirmation of exact Extension API contracts before implementation.

## Blockers

None.

## Remaining Work

- Wait for user confirmation before Stage 17.
- Confirm Extension API request/response contracts.
- Do not add extension API endpoints, extension frontend code, or site-specific parsers until Stage 17 is explicitly started and contracts are confirmed.
