# Next Session Handoff

## Current State

Stage 4 - Shared Packages is completed.

Product capabilities are not implemented yet. The project currently has project management documentation, the base monorepo structure, baseline TypeScript/ESLint/Prettier tooling, Docker infrastructure, and shared package boundaries.

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

## Remaining Work

- Stage 5 - Backend Skeleton.
- Do not start Stage 5 until the user confirms.

## Next Stage

Stage 5 - Backend Skeleton, but only after explicit user confirmation.

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
- Docker app services currently use placeholder commands because real apps do not exist yet.
- Replace Docker placeholder commands during the relevant app implementation stages.
- Use `docker compose --env-file .env.development -f docker-compose.yml -f docker-compose.dev.yml ...` for development, or `make dev` where `make` is installed.
- Current Windows environment does not have `make` installed.
- `pnpm` is not installed globally in the current environment; use `corepack pnpm ...`.
- `package.json` pins `pnpm@11.9.0`.
- Current workspace is not a git repository; `git status --short` fails until git is initialized or the correct repo root is opened.
- Update `project-management/` after every completed stage.
