# Current State

## Snapshot

- Date: 2026-06-24
- Current stage: Waiting for user confirmation before Stage 4
- Stage status: Stage 3 completed
- MVP readiness: 3%
- Last completed stage: Stage 3 - Docker Infrastructure
- Next stage: Stage 4 - Shared Packages

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

The Docker infrastructure foundation is initialized:

- Base Docker Compose configuration exists.
- Development and production Docker Compose overrides exist.
- PostgreSQL, Redis, and MinIO services are prepared.
- `api`, `web`, and `extension` each have a dedicated Dockerfile.
- Environment templates/placeholders exist.
- Root `.dockerignore` minimizes Docker build context.
- `Makefile` provides short development commands.
- Development stack startup was verified with Docker Compose.
- Development and production Docker image builds were verified.

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

Stage 3 created Docker infrastructure only. It did not add backend, frontend, extension framework code, database migrations, or business modules.

Current app containers use temporary placeholder commands because the applications are not implemented yet. Future app stages should replace these commands with real app start commands without changing the overall Docker structure.
