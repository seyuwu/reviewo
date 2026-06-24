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
