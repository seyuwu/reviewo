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

Stage 12 - Reviews Module is next, pending explicit user confirmation.

## Goal

Prepare Reviews Module after user confirmation.

## Files To Create

To be confirmed before Stage 12 implementation.

## Files To Change

To be confirmed before Stage 12 implementation.

## Architectural Decisions For This Stage

- Stage 12 should implement reviews only.
- Reviews must not duplicate rating logic.
- Reviews should depend on the public `EntitiesPort`, not entity repositories.
- Reviews should remain separate from Ratings Module aggregates.
- Do not add trust calculation, recommendations, moderation workflow, frontend, or extension flow in Stage 12.

## Tasks

- [ ] Wait for user confirmation to start Stage 12.
- [ ] Describe Stage 12 goal, files, and architectural decisions before editing.
- [ ] Implement Reviews Module only.
- [ ] Verify backend lint/typecheck/build and review behavior.

## Current Progress

Stage 11 is complete. Stage 12 has not started.

## Open Questions

No active questions until Stage 12 starts.

## Blockers

None.

## Remaining Work

- Wait for user confirmation before Stage 12.
- Do not add reviews models, DTOs, endpoints, repositories, or business logic until Stage 12 is explicitly started.
