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

Stage 10 - URL Normalization MVP is next, pending explicit user confirmation.

## Goal

Prepare URL Normalization MVP after user confirmation.

## Files To Create

To be confirmed before Stage 10 implementation.

## Files To Change

To be confirmed before Stage 10 implementation.

## Architectural Decisions For This Stage

- Stage 10 should implement minimal URL canonicalization only.
- URL normalization must be isolated and replaceable.
- Stage 10 may refine how `canonical_url` is produced, but should not add `entity_links` unless explicitly approved.
- Do not add site-specific parsers, OpenSearch, ratings, reviews, trust, or extension behavior in Stage 10.

## Tasks

- [ ] Wait for user confirmation to start Stage 10.
- [ ] Describe Stage 10 goal, files, and architectural decisions before editing.
- [ ] Implement URL Normalization MVP only.
- [ ] Verify backend lint/typecheck/build and URL normalization behavior.

## Current Progress

Stage 9 is complete. Stage 10 has not started.

## Open Questions

No active questions until Stage 10 starts.

## Blockers

None.

## Remaining Work

- Wait for user confirmation before Stage 10.
- Do not add URL normalization code until Stage 10 is explicitly started.
