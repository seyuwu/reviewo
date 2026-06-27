# In Progress

## Current Stage

No active implementation stage.

Stage 27 - Extension Submit Rating is completed.

Stage 28 - Lazy Entity Creation is next, pending explicit user confirmation and RFC 0007 scope reconfirmation.

## Goal

Prepare Lazy Entity Creation (RFC 0007) after user confirmation.

## Files To Create

To be confirmed before Stage 28 implementation.

## Files To Change

To be confirmed before Stage 28 implementation.

## Architectural Decisions For This Stage

- Stage 28 should implement lazy entity creation per RFC 0007 after user confirmation.
- Use application-level `RateSiteUseCase` orchestration; do not let Ratings/Reviews call Entities directly.
- Do not change web lazy flows in Stage 28 unless explicitly confirmed.

## Tasks

- [ ] Wait for user confirmation to start Stage 28.
- [ ] Reconfirm RFC 0007 scope before implementation.
- [ ] Describe Stage 28 goal, files, and architectural decisions before editing.
- [ ] Implement Lazy Entity Creation only.
- [ ] Verify lint/typecheck/build behavior.

## Current Progress

Stage 27 is complete. Stage 28 has not started.

## Open Questions

Stage 28 requires confirmation before implementing RFC 0007 lazy entity creation.

## Blockers

None.

## Remaining Work

- Wait for user confirmation before Stage 28.
- Implement `ensureEntityForUrl`, `RateSiteUseCase`, and extension by-url rating endpoint.
- Do not change web lazy flows until a later stage unless explicitly confirmed.
