# Next Session Handoff

## Current State

Stage 8 - Users/Auth MVP Foundation is completed.

The first product capability is implemented: users can register, sign in, and read the current authenticated user through the backend API. The project currently has project management documentation, the base monorepo structure, baseline TypeScript/ESLint/Prettier tooling, Docker infrastructure, shared package boundaries, a NestJS backend skeleton, Prisma database infrastructure, centralized backend error/validation response infrastructure, and Users/Auth MVP foundation.

## Already Done

- Documentation was analyzed.
- The MVP development plan was approved.
- The following architectural decisions were confirmed:
  - Root-level markdown files are the temporary source of truth.
  - MVP entity model uses `parent_id`, `entity_links`, and `canonical_url`.
  - `entity_relations` is deferred.
  - MVP trust score is simple and replaceable.
  - Extension MVP uses URL-only detection.
  - API changes must be proposed before implementation.
- `project-management/` was created.
- Root `package.json` was created.
- `pnpm-workspace.yaml` was created.
- `pnpm-lock.yaml` was created.
- `.gitignore` was created.
- App placeholders were created:
  - `apps/api/.gitkeep`
  - `apps/web/.gitkeep`
  - `apps/extension/.gitkeep`
- Initial package placeholders were created during Stage 1 and later replaced by real shared package boundaries in Stage 4.
- Stage 1 was verified with:
  - `corepack pnpm install`
  - `corepack pnpm check`
- Roadmap was updated:
  - Docker Infrastructure is now Stage 3.
  - Later stages were shifted by one number.
- Stage 2 tooling was added:
  - `tsconfig.base.json`
  - `tsconfig.json`
  - `eslint.config.mjs`
  - `.prettierrc.json`
  - `.prettierignore`
  - `packages/config/package.json`
  - `packages/config/tsconfig.base.json`
  - `packages/config/eslint.config.mjs`
  - `packages/config/prettier.config.json`
- Stage 2 was verified with:
  - `corepack pnpm lint`
  - `corepack pnpm typecheck`
  - `corepack pnpm format:check`
  - `corepack pnpm build`
- Stage 3 Docker infrastructure was added:
  - `docker-compose.yml`
  - `docker-compose.dev.yml`
  - `docker-compose.prod.yml`
  - `docker/api/Dockerfile`
  - `docker/web/Dockerfile`
  - `docker/extension/Dockerfile`
  - `.env.example`
  - `.env.development`
  - `.env.production`
  - `.dockerignore`
  - `Makefile`
- Stage 3 was verified with:
  - `docker compose config`
  - `docker compose --env-file .env.development -f docker-compose.yml -f docker-compose.dev.yml config`
  - `docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml config`
  - `docker compose --env-file .env.development -f docker-compose.yml -f docker-compose.dev.yml build`
  - `docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml build`
  - `docker compose --env-file .env.development -f docker-compose.yml -f docker-compose.dev.yml up -d`
  - `docker compose --env-file .env.development -f docker-compose.yml -f docker-compose.dev.yml down --remove-orphans`
- Stage 4 shared packages were added:
  - `packages/types/package.json`
  - `packages/types/tsconfig.json`
  - `packages/types/src/index.ts`
  - `packages/shared/package.json`
  - `packages/shared/tsconfig.json`
  - `packages/shared/src/index.ts`
  - `packages/ui/package.json`
  - `packages/ui/tsconfig.json`
  - `packages/ui/src/index.ts`
- Stage 4 was verified with:
  - `corepack pnpm install`
  - `corepack pnpm lint`
  - `corepack pnpm typecheck`
  - `corepack pnpm build`
  - `corepack pnpm format:check`
  - built package entry point import check
  - dev Docker image build
  - prod Docker image build
- Stage 5 backend skeleton was added:
  - `apps/api/package.json`
  - `apps/api/tsconfig.json`
  - `apps/api/src/main.ts`
  - `apps/api/src/app.module.ts`
  - `apps/api/src/common/logger/app-logger.service.ts`
  - `apps/api/src/config/app-config.module.ts`
  - `apps/api/src/config/environment.config.ts`
  - `apps/api/src/config/environment.validation.ts`
  - `apps/api/src/health/health.controller.ts`
  - `apps/api/src/health/health.module.ts`
  - empty module shells under `apps/api/src/modules/`
  - common infrastructure folders under `apps/api/src/common/`
- Stage 5 was verified with:
  - `corepack pnpm install`
  - `corepack pnpm lint`
  - `corepack pnpm typecheck`
  - `corepack pnpm build`
  - `corepack pnpm format:check`
  - `corepack pnpm test`
  - local `GET /health`
  - Docker dev `GET /health`
  - production Docker image build
- Stage 6 database infrastructure was added:
  - `apps/api/prisma.config.ts`
  - `apps/api/prisma/schema.prisma`
  - `apps/api/prisma/migrations/migration_lock.toml`
  - `apps/api/prisma/migrations/20260624182000_init_database_schemas/migration.sql`
  - `apps/api/prisma/seed.mjs`
  - `apps/api/src/database/database.module.ts`
  - `apps/api/src/database/prisma.service.ts`
  - `apps/api/src/health/health.service.ts`
- Stage 6 was verified with:
  - `corepack pnpm --filter @reviewo/api db:generate`
  - Prisma migration deploy inside Docker Compose network
  - schema existence check in PostgreSQL
  - Docker API `GET /health` with database check
  - `corepack pnpm lint`
  - `corepack pnpm typecheck`
  - `corepack pnpm build`
  - `corepack pnpm format:check`
  - `corepack pnpm test`
  - production Docker image build
- Stage 7 backend error and response foundation was added:
  - `apps/api/src/common/exceptions/app-error-code.ts`
  - `apps/api/src/common/exceptions/app.exception.ts`
  - `apps/api/src/common/exceptions/validation.exception.ts`
  - `apps/api/src/common/filters/api-error-response.ts`
  - `apps/api/src/common/filters/global-exception.filter.ts`
  - `apps/api/src/common/pipes/validation-exception.factory.ts`
  - `apps/api/src/app.module.ts` updated to provide `GlobalExceptionFilter`
  - `apps/api/src/main.ts` updated to register global exception filter and validation exception factory
- Stage 7 was verified with:
  - `corepack pnpm lint`
  - `corepack pnpm typecheck`
  - `corepack pnpm build`
  - `corepack pnpm format:check`
  - `corepack pnpm test`
  - Docker Prisma migration deploy inside Docker Compose network
  - Docker API `GET /health`
  - Docker API normalized 404 response for `/missing`
- Stage 8 Users/Auth MVP foundation was added:
  - `apps/api/prisma/migrations/20260626224500_add_users_auth_foundation/migration.sql`
  - `apps/api/prisma/schema.prisma` models for `users.users` and `auth.user_auth_identities`
  - `apps/api/src/common/decorators/current-user.decorator.ts`
  - `apps/api/src/common/interfaces/authenticated-request.ts`
  - `apps/api/src/modules/auth/controllers/auth.controller.ts`
  - `apps/api/src/modules/auth/dto/*`
  - `apps/api/src/modules/auth/guards/jwt-auth.guard.ts`
  - `apps/api/src/modules/auth/repositories/auth.repository.ts`
  - `apps/api/src/modules/auth/services/*`
  - `apps/api/src/modules/users/repositories/users.repository.ts`
  - `apps/api/src/modules/users/services/users.service.ts`
  - JWT environment validation/configuration
  - Docker API port mapping aligned with `API_PORT`
- Stage 8 was verified with:
  - `corepack pnpm --filter @reviewo/api db:generate`
  - `corepack pnpm lint`
  - `corepack pnpm typecheck`
  - `corepack pnpm build`
  - `corepack pnpm format:check`
  - `corepack pnpm test`
  - Docker Prisma migration deploy inside Docker Compose network
  - Docker API `GET /health`
  - Docker API `POST /auth/register`
  - Docker API `POST /auth/login`
  - Docker API `GET /auth/me` with Bearer token
  - Docker API unauthorized response for `GET /auth/me`
  - Alternate `API_PORT` Docker health smoke

## Remaining Work

- Stage 9 - Entities Module.
- Do not start Stage 9 until the user confirms.

## Next Stage

Stage 9 - Entities Module, but only after explicit user confirmation.

## Documents To Read First

1. All documentation from `docs/`.
2. If `docs/` does not exist, read root-level markdown documentation files.
3. All files in `project-management/`.

## Pay Attention To

- Documentation has priority over implementation.
- Do not create API contracts without proposing them first.
- Do not add framework code outside the approved stage.
- Shared packages currently expose empty public entry points intentionally.
- Do not add API DTOs to `@reviewo/types` until API contracts are approved.
- Do not add generic helpers to `@reviewo/shared` without real duplication.
- Do not add UI components to `@reviewo/ui` before frontend/design-system stages.
- Backend currently exposes `GET /health` and minimal auth endpoints under `/auth`.
- `GET /health` now includes database connectivity status.
- Backend errors now use a centralized infrastructure response shape.
- Global exception filter is registered in API bootstrap.
- Validation errors are prepared through a centralized exception factory, but no product DTOs exist yet.
- Users/Auth MVP uses email/password with JWT access tokens.
- `POST /auth/register`, `POST /auth/login`, and `GET /auth/me` exist.
- `GET /auth/me` requires Bearer token authentication.
- OAuth, refresh tokens, email verification, password reset, roles, and permissions are intentionally deferred.
- Other backend domain modules are empty NestJS module shells only.
- Do not add DTOs, repositories, entities, Swagger, or business logic outside the relevant stage.
- Prisma schema now has only Users/Auth models.
- Initial Prisma migration creates PostgreSQL schemas; Stage 8 migration creates only `users.users` and `auth.user_auth_identities`.
- Future domain modules must use `DatabaseModule`/`PrismaService` through DI, not create their own connections.
- Stage 9 should implement entity domain only. MVP entity model uses `parent_id`, `entity_links`, and `canonical_url`; `entity_relations` remains deferred.
- URL normalization has a dedicated Stage 10 and should not be fully implemented in Stage 9 unless explicitly approved.
- Web and extension Docker services still use placeholder commands because those apps do not exist yet.
- Use `docker compose --env-file .env.development -f docker-compose.yml -f docker-compose.dev.yml ...` for development, or `make dev` where `make` is installed.
- Current Windows environment does not have `make` installed.
- `pnpm` is not installed globally in the current environment; use `corepack pnpm ...`.
- `package.json` pins `pnpm@11.9.0`.
- Current workspace is a git repository.
- Update `project-management/` after every completed stage.
