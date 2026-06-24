# Changelog

## 2026-06-24 - Project Management Initialization

- Stage: Pre-Stage 1 setup
- Summary: Created the project management documentation structure required for stage-based MVP development.
- Created modules: none.
- Changed modules: none.
- Architectural changes: Established persistent project state tracking, decision log, backlog, known issues, changelog, and next-session handoff.

## 2026-06-24 - Stage 1 - Monorepo Initialization

- Stage: 1
- Summary: Initialized the base monorepo structure with root workspace metadata, `pnpm` workspace configuration, application placeholders, shared package placeholders, and ignore rules.
- Created modules: none.
- Changed modules: none.
- Created files:
  - `package.json`
  - `pnpm-workspace.yaml`
  - `pnpm-lock.yaml`
  - `.gitignore`
  - `apps/api/.gitkeep`
  - `apps/web/.gitkeep`
  - `apps/extension/.gitkeep`
  - `packages/ui/.gitkeep`
  - `packages/shared/.gitkeep`
  - `packages/types/.gitkeep`
  - `packages/config/.gitkeep`
- Changed files:
  - `project-management/00-current-state.md`
  - `project-management/01-master-plan.md`
  - `project-management/03-in-progress.md`
  - `project-management/04-decisions.md`
  - `project-management/05-known-issues.md`
  - `project-management/06-changelog.md`
  - `project-management/07-next-session.md`
- Important architectural changes:
  - Selected `pnpm` workspaces as the initial monorepo foundation.
  - Pinned `pnpm@11.9.0` in `package.json`.
  - Deferred Nx/Turborepo until real orchestration needs appear.

## 2026-06-24 - Roadmap Update - Docker Infrastructure

- Stage: Roadmap update before Stage 2
- Summary: Added Docker Infrastructure as a dedicated Stage 3 after TypeScript And Tooling Setup and shifted later stages by one number.
- Created modules: none.
- Changed modules: none.
- Important architectural changes:
  - Docker development and production infrastructure will be designed before shared packages and application frameworks.
  - The future Docker stage must support one-command development startup and a production update path that does not require project restructuring.

## 2026-06-24 - Stage 2 - TypeScript And Tooling Setup

- Stage: 2
- Summary: Added strict TypeScript, ESLint, Prettier, root verification scripts, and reusable shared tooling presets.
- Created modules:
  - `packages/config`
- Changed modules: none.
- Created files:
  - `tsconfig.base.json`
  - `tsconfig.json`
  - `eslint.config.mjs`
  - `.prettierrc.json`
  - `.prettierignore`
  - `packages/config/package.json`
  - `packages/config/tsconfig.base.json`
  - `packages/config/eslint.config.mjs`
  - `packages/config/prettier.config.json`
- Changed files:
  - `package.json`
  - `pnpm-lock.yaml`
  - `project-management/00-current-state.md`
  - `project-management/01-master-plan.md`
  - `project-management/03-in-progress.md`
  - `project-management/04-decisions.md`
  - `project-management/06-changelog.md`
  - `project-management/07-next-session.md`
- Important architectural changes:
  - `packages/config` is now the shared source for baseline TypeScript, ESLint, and Prettier presets.
  - Root configs remain framework-neutral and do not introduce backend, frontend, or extension framework assumptions.

## 2026-06-24 - Stage 3 - Docker Infrastructure

- Stage: 3
- Summary: Added Docker infrastructure for development and production, including base/dev/prod Compose files, app Dockerfiles, environment templates, Docker ignore rules, and Makefile commands.
- Created modules: none.
- Changed modules: none.
- Created files:
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
- Changed files:
  - `project-management/00-current-state.md`
  - `project-management/01-master-plan.md`
  - `project-management/03-in-progress.md`
  - `project-management/04-decisions.md`
  - `project-management/05-known-issues.md`
  - `project-management/06-changelog.md`
  - `project-management/07-next-session.md`
- Important architectural changes:
  - Docker Compose is split into base, development override, and production override.
  - PostgreSQL, Redis, and MinIO are part of the infrastructure foundation.
  - Each future app has a dedicated Dockerfile and image boundary.
  - Docker image tags can be controlled through environment values for future CI/CD and production updates.
  - App containers use temporary placeholder commands until real apps are implemented.

## 2026-06-24 - Stage 4 - Shared Packages

- Stage: 4
- Summary: Created importable shared package boundaries for types, shared utilities, and UI without adding business logic, API contracts, or UI components.
- Created modules:
  - `@reviewo/types`
  - `@reviewo/shared`
  - `@reviewo/ui`
- Changed modules:
  - Root TypeScript project references.
- Created files:
  - `packages/types/package.json`
  - `packages/types/tsconfig.json`
  - `packages/types/src/index.ts`
  - `packages/shared/package.json`
  - `packages/shared/tsconfig.json`
  - `packages/shared/src/index.ts`
  - `packages/ui/package.json`
  - `packages/ui/tsconfig.json`
  - `packages/ui/src/index.ts`
- Changed files:
  - `tsconfig.json`
  - `pnpm-lock.yaml`
  - `project-management/00-current-state.md`
  - `project-management/01-master-plan.md`
  - `project-management/03-in-progress.md`
  - `project-management/04-decisions.md`
  - `project-management/06-changelog.md`
  - `project-management/07-next-session.md`
- Important architectural changes:
  - Shared packages now exist as explicit workspace boundaries.
  - `@reviewo/types` intentionally contains no API DTOs until API contracts are approved.
  - `@reviewo/shared` intentionally contains no generic utilities until real duplication appears.
  - `@reviewo/ui` intentionally contains no UI components until frontend/design-system stages.

## 2026-06-24 - Stage 5 - Backend Skeleton

- Stage: 5
- Summary: Created a NestJS backend skeleton with config foundation, logger wrapper, health endpoint, common infrastructure folders, and empty domain module shells.
- Created modules:
  - `@reviewo/api`
- Changed modules:
  - Docker API service now runs the NestJS API.
- Created files:
  - `apps/api/package.json`
  - `apps/api/tsconfig.json`
  - `apps/api/src/main.ts`
  - `apps/api/src/app.module.ts`
  - `apps/api/src/common/logger/app-logger.service.ts`
  - `apps/api/src/common/filters/.gitkeep`
  - `apps/api/src/common/interceptors/.gitkeep`
  - `apps/api/src/common/guards/.gitkeep`
  - `apps/api/src/common/pipes/.gitkeep`
  - `apps/api/src/common/decorators/.gitkeep`
  - `apps/api/src/common/exceptions/.gitkeep`
  - `apps/api/src/config/app-config.module.ts`
  - `apps/api/src/config/environment.config.ts`
  - `apps/api/src/config/environment.validation.ts`
  - `apps/api/src/health/health.controller.ts`
  - `apps/api/src/health/health.module.ts`
  - `apps/api/src/modules/auth/auth.module.ts`
  - `apps/api/src/modules/users/users.module.ts`
  - `apps/api/src/modules/entities/entities.module.ts`
  - `apps/api/src/modules/ratings/ratings.module.ts`
  - `apps/api/src/modules/reviews/reviews.module.ts`
  - `apps/api/src/modules/trust/trust.module.ts`
  - `apps/api/src/modules/search/search.module.ts`
  - `apps/api/src/modules/notifications/notifications.module.ts`
  - `apps/api/src/modules/moderation/moderation.module.ts`
  - `apps/api/src/modules/recommendation/recommendation.module.ts`
  - `apps/api/src/shared/.gitkeep`
- Changed files:
  - `.dockerignore`
  - `.env.example`
  - `.env.development`
  - `.env.production`
  - `.gitignore`
  - `.prettierignore`
  - `docker-compose.yml`
  - `docker-compose.dev.yml`
  - `docker-compose.prod.yml`
  - `docker/api/Dockerfile`
  - `eslint.config.mjs`
  - `pnpm-lock.yaml`
  - `tsconfig.json`
  - `project-management/00-current-state.md`
  - `project-management/01-master-plan.md`
  - `project-management/03-in-progress.md`
  - `project-management/04-decisions.md`
  - `project-management/05-known-issues.md`
  - `project-management/06-changelog.md`
  - `project-management/07-next-session.md`
- Important architectural changes:
  - Backend now has a NestJS modular monolith skeleton.
  - `GET /health` is the only backend endpoint.
  - Future domain modules exist as empty module shells only.
  - Config validation is limited to current runtime settings.
  - No database, ORM, auth, DTO, repository, entity, Swagger, or business logic was added.
