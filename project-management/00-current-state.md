# Current State

## Snapshot

- Date: 2026-06-24
- Current stage: Waiting for user confirmation before Stage 3
- Stage status: Stage 2 completed
- MVP readiness: 2%
- Last completed stage: Stage 2 - TypeScript And Tooling Setup
- Next stage: Stage 3 - Docker Infrastructure

## Implemented Capabilities

No product capabilities are implemented yet.

The project currently contains temporary root-level markdown documentation. The documentation is accepted as the source of truth until it is moved into `docs/`.

The monorepo foundation is initialized:

- Root workspace metadata exists in `package.json`.
- Workspace boundaries are configured in `pnpm-workspace.yaml`.
- Application placeholders exist under `apps/api`, `apps/web`, and `apps/extension`.
- Shared package placeholders exist under `packages/ui`, `packages/shared`, `packages/types`, and `packages/config`.
- Dependency installation is verified through Corepack-managed `pnpm`.

The TypeScript and tooling baseline is initialized:

- Strict TypeScript base configuration exists.
- Root `tsconfig.json` is ready for project references.
- ESLint flat config is configured.
- Prettier is configured.
- Shared tooling presets exist in `packages/config`.
- Root scripts verify linting, typechecking, formatting, and build.

Roadmap update:

- Docker Infrastructure was added as Stage 3.
- Later stages were shifted by one number.
- Docker files are not part of Stage 2.

## Current Architecture State

- Target architecture: TypeScript monorepo.
- Backend target: NestJS modular monolith.
- Frontend target: Next.js feature-based architecture.
- Browser extension target: Chrome-first MVP extension.
- Database target: PostgreSQL with domain-oriented schemas.
- Business logic ownership: backend only.

## Architectural Constraints

- Modular monolith first, gradual microservice extraction later.
- Clear domain boundaries.
- Modules interact only through public interfaces or events.
- No direct cross-module repository access.
- No duplicated business logic across backend, frontend, and extension.
- Frontend and extension communicate only through public API contracts.
- MVP entity model uses `parent_id`, `entity_links`, and `canonical_url`.
- `entity_relations` is intentionally excluded from MVP.
- MVP trust score must be replaceable without API changes.
- Extension MVP uses URL-only detection. No site-specific parsers in MVP.

## Current Blockers

No active blockers.

## Notes

Stage 1 created only the monorepo foundation and workspace structure. Backend, frontend, extension frameworks, database tooling, and business modules are intentionally not added yet.

Stage 2 created only strict TypeScript and baseline development tooling. Docker infrastructure is intentionally deferred to Stage 3.
