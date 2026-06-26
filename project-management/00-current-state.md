# Current State

## Snapshot

- Date: 2026-06-26
- Current stage: Waiting for user confirmation before Stage 10
- Stage status: Stage 9 completed
- MVP readiness: 9%
- Last completed stage: Stage 9 - Entities Module
- Next stage: Stage 10 - URL Normalization MVP

## Implemented Capabilities

The first product capabilities are implemented: users can register, sign in, read the current authenticated user, create entities, fetch entities by id, and search entities through the backend API.

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
- No ratings, reviews, trust, search, moderation, recommendation, Swagger, frontend, or extension product behavior has been added.

The database infrastructure is initialized:

- Prisma is configured as the ORM and migration tooling.
- Prisma 7 configuration lives in `apps/api/prisma.config.ts`.
- Prisma schema exists with Users/Auth and Entity MVP models.
- Initial migration creates PostgreSQL schemas only.
- `DatabaseModule` exposes a single infrastructure Prisma provider through DI.
- `PrismaService` owns database connection lifecycle and shutdown.
- Seed script structure exists without seed data.
- Health endpoint includes a database connectivity check.
- No ratings, reviews, trust, search, moderation, recommendation, or extension tables have been added.

The backend error and response foundation is initialized:

- Global exception filter normalizes HTTP and unknown errors.
- API errors use one infrastructure response shape.
- Base `AppException` and application error codes exist for future modules.
- Validation pipe uses a centralized validation exception factory.
- Unknown errors are logged and do not expose internal details.
- Controllers do not manually build error responses.
- No product API endpoints, DTOs, auth, repositories, or business logic have been added.

The Users/Auth MVP foundation is initialized:

- MVP auth approach is email/password with JWT access tokens.
- `users.users` stores user profile/account state.
- `auth.user_auth_identities` stores email auth identity and password hash.
- Password hashing uses Node built-in `scrypt`.
- `POST /auth/register` creates a user and returns an access token.
- `POST /auth/login` verifies credentials and returns an access token.
- `GET /auth/me` returns the authenticated user and requires a Bearer token.
- JWT auth guard loads active users through the `users` module.
- OAuth, refresh tokens, email verification, password reset, roles, and permissions are intentionally deferred.

The Entity MVP foundation is initialized:

- `entities.entities` stores the central MVP entity model.
- Entity fields are limited to `id`, `title`, `slug`, `type`, `description`, `canonical_url`, `parent_id`, `created_by`, `created_at`, and `updated_at`.
- Entity type is stored as a PostgreSQL enum.
- `parent_id` supports a simple tree.
- `entity_relations`, graph relations, many-to-many entity links, aliases, tags, categories, versions, moderation, merge, AI, import, ratings, reviews, trust, and recommendations are intentionally not implemented.
- `POST /entities` creates an entity and requires JWT authentication.
- `GET /entities/:id` returns an entity by id.
- `GET /entities/search` performs simple PostgreSQL-backed search.
- `EntitiesPort` exists as the future public module interface.

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
- Stage 9 MVP entity model uses `parent_id` and one optional `canonical_url`; `entity_links` is deferred by the Stage 9 scope clarification.
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

Stage 6 created database infrastructure only. Prisma migrations currently create schemas, not domain tables.

Stage 7 created backend error and response infrastructure only. It did not add domain-specific errors, product API endpoints, DTOs, repositories, auth, or business logic.

Stage 8 created the minimum users/auth foundation needed before ratings. It did not add entities, ratings, reviews, roles, permissions, OAuth, refresh tokens, or frontend/extension integration.

Stage 9 created the minimum entity domain foundation. It did not add entity links, aliases, URL normalization, ratings, reviews, trust, recommendations, moderation, tags, categories, versions, merge, AI, or imports.
