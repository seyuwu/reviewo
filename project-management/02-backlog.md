# Backlog

This file contains work that is outside the current stage. Do not mix active implementation tasks with backlog items.

## Documentation

- Move root-level markdown documentation into `docs/` using the structure described in `Структура.md`.
- Create dedicated `04-api.md` before implementing non-trivial API contracts.
- Split large extension documentation into focused RFCs after MVP direction is stable.

## Future RFCs

- Site-specific browser extension parsers.
- Advanced entity relation model with `entity_relations`.
- Advanced trust score system and trust signals.
- OpenSearch or Elasticsearch search infrastructure.
- Recommendation system.
- Notification system.
- Public API and SDK.
- Mobile application.
- AI review summaries.

## Technical Debt To Watch

- Avoid allowing shared packages to become business-logic dumping grounds.
- Avoid frontend features mirroring backend domains too tightly.
- Avoid extension-specific API shortcuts that expose backend internals.
- Keep URL normalization isolated so it can evolve without breaking entity contracts.

## Post-MVP Product Ideas

- Firefox, Edge, and Yandex Browser support.
- Collections and lists.
- Subscriptions.
- Embedded rating widgets.
- Developer tools.
- Import tools.
- Rich moderation admin workflows.
