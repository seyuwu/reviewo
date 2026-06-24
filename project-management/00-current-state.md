# Current State

## Snapshot

- Date: 2026-06-24
- Current stage: Waiting for user confirmation before Stage 6
- Stage status: Stage 5 completed
- MVP readiness: 5%
- Last completed stage: Stage 5 - Backend Skeleton
- Next stage: Stage 6 - Database Infrastructure

## Implemented Capabilities

No product capabilities are implemented yet.

The project currently contains temporary root-level markdown documentation. The documentation is accepted as the source of truth until it is moved into `docs/`.

The monorepo foundation is initialized:

- Root workspace metadata exists in `package.json`.
- Workspace boundaries are configured in `pnpm-workspace.yaml`.
- Application placeholders exist under `apps/api`, `apps/web`, and `apps/extension`.
- Shared workspace packages exist under `packages/ui`, `packages/shared`, `packages/types`, and `packages/config`.
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

The shared package foundation is initialized:

- `@reviewo/types` exists as the future home for approved cross-application contracts.
- `@reviewo/shared` exists as the future home for generic technical utilities.
- `@reviewo/ui` exists as the future home for design-system UI.
- `@reviewo/config` exists as the shared tooling configuration package.
- Shared packages currently expose empty public entry points only.
- No API DTO, business logic, or UI components have been added yet.

The backend skeleton is initialized:

- `@reviewo/api` exists as a NestJS application package.
- `GET /health` is available for Docker and future production checks.
- Centralized config foundation exists through `ConfigModule`.
- Runtime environment validation exists for current application settings.
- Standard Nest logger is wrapped by `AppLogger` for future replacement.
- Common infrastructure folders exist for filters, interceptors, guards, pipes, decorators, exceptions, and logger.
- Future domain modules exist as empty NestJS module shells.
- No database, ORM, auth, DTO, repositories, entities, Swagger, or domain business logic has been added.

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

Stage 4 created shared package boundaries only. These packages must remain free of business logic unless a future stage explicitly introduces approved shared contracts or technical utilities.

Stage 5 created backend skeleton only. The only HTTP endpoint is `GET /health`.
