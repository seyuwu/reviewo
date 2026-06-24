# Architecture Decisions

## 2026-06-24 - Temporary Documentation Source

### Problem

The initial prompt refers to documentation under `docs/`, but the repository currently stores markdown documentation files in the project root.

### Decision

Until documentation is moved, root-level markdown files are the source of truth.

### Reason

The user confirmed that the current root-level markdown files are temporary but authoritative.

### Alternatives

- Stop development until documentation is moved to `docs/`.
- Create the `docs/` structure immediately.

## 2026-06-24 - MVP Entity Model

### Problem

The project can eventually need graph-like relations between entities, but implementing `entity_relations` in MVP would increase complexity.

### Decision

MVP uses `parent_id`, `entity_links`, and `canonical_url`. `entity_relations` is not implemented in MVP.

### Reason

This keeps the model simple while preserving a path to future relation modeling.

### Alternatives

- Implement `entity_relations` immediately.
- Use only flat entities without hierarchy.

## 2026-06-24 - MVP Trust Score

### Problem

Trust score is important, but a full trust-signal system is too large for MVP.

### Decision

MVP trust score uses rating count, review count, entity age, and user activity. The algorithm must be isolated so it can be replaced without API changes.

### Reason

This provides an explainable initial trust value without blocking MVP on complex anti-fraud logic.

### Alternatives

- Delay trust score entirely.
- Implement the full trust signal model immediately.

## 2026-06-24 - Browser Extension MVP Scope

### Problem

Site-specific parsers add value but create a large scope for the first extension release.

### Decision

MVP extension detects only the current URL and sends it to backend. Backend determines object type from the URL. No YouTube, GitHub, Amazon, or other site-specific parsers are implemented in MVP.

### Reason

This keeps the extension small and validates the core user flow first.

### Alternatives

- Add several site-specific parsers in MVP.
- Delay extension until after the web app is complete.

## 2026-06-24 - Project Management Folder

### Problem

The project needs durable context across chats and strict stage tracking.

### Decision

Create `project-management/` with current state, master plan, backlog, in-progress work, decisions, known issues, changelog, and next-session handoff.

### Reason

This allows future sessions to continue development after reading `docs/` and `project-management/`.

### Alternatives

- Keep status only in chat history.
- Mix planning notes into product documentation.

## 2026-06-24 - Initial Monorepo Tooling

### Problem

The MVP requires a monorepo, but full orchestration tooling may be premature at the first stage.

### Decision

Use `pnpm` workspaces for Stage 1. Do not add Turborepo or Nx yet. Pin the package manager in `package.json` as `pnpm@11.9.0` and use Corepack when `pnpm` is not installed globally.

### Reason

`pnpm` workspaces provide explicit package boundaries and simple dependency management without adding orchestration complexity before there are real build/test workflows. Corepack is already available in the environment and allows reproducible `pnpm` usage without adding `pnpm` as a project dependency.

### Alternatives

- Use npm workspaces.
- Use Yarn workspaces.
- Add Turborepo immediately.
- Add Nx immediately.

## 2026-06-24 - Docker Infrastructure Roadmap Stage

### Problem

The MVP must be runnable in development and production with one command, and production updates should not require changing the project structure later.

### Decision

Add a dedicated Docker Infrastructure stage immediately after TypeScript And Tooling Setup. This stage will prepare Docker Compose base, development, and production files, Dockerfiles for each app, `.env.example`, `.dockerignore`, and a `Makefile` or `Taskfile.yml`.

### Reason

Docker affects app boundaries, environment configuration, development commands, and production deployment shape. Making it a dedicated early stage prevents deployment concerns from being bolted on after app code appears.

### Alternatives

- Delay Docker until production readiness.
- Add Docker files separately inside each app stage.
- Use only local non-Docker development during MVP.

## 2026-06-24 - TypeScript And Tooling Baseline

### Problem

The monorepo needs strict TypeScript and consistent formatting/linting before application code is added.

### Decision

Use TypeScript Strict Mode, ESLint flat config, Prettier, and shared tooling presets in `packages/config`. Root configs consume the shared presets and add only workspace-level behavior.

### Reason

This keeps tooling framework-neutral and reusable across backend, frontend, extension, and packages without duplicating configuration in each app.

### Alternatives

- Configure each app independently.
- Delay linting and formatting until apps are created.
- Use framework-specific tooling presets before framework stages begin.

## 2026-06-24 - Docker Compose Layering

### Problem

The platform must run in development and production while avoiding duplicated Docker Compose configuration.

### Decision

Use `docker-compose.yml` as the base configuration and use `docker-compose.dev.yml` and `docker-compose.prod.yml` as environment-specific overrides.

### Reason

This keeps shared infrastructure, networks, volumes, and app service definitions in one place while allowing development and production to differ in commands, restart policies, environment files, and mounts.

### Alternatives

- Keep one large Compose file for every environment.
- Make development and production Compose files fully standalone.
- Generate Compose files through scripts.

## 2026-06-24 - Dedicated Dockerfile Per Application

### Problem

The apps are not implemented yet, but future services need clear deployment boundaries from the beginning.

### Decision

Create separate Dockerfiles for `api`, `web`, and `extension` under `docker/api`, `docker/web`, and `docker/extension`.

### Reason

This preserves independent app build/deployment boundaries and allows each app to evolve without changing the global Docker layout.

### Alternatives

- Use one shared Dockerfile for all Node apps.
- Delay Dockerfiles until each app is implemented.
- Put Dockerfiles directly inside `apps/*`.

## 2026-06-24 - Docker Placeholder Commands

### Problem

Docker app services must exist now, but `api`, `web`, and `extension` do not yet contain application code.

### Decision

Use temporary app container commands that run `corepack pnpm check` and then stay alive. Replace these commands with real app start commands during the corresponding app stages.

### Reason

This allows Docker Compose to start the complete future topology now without introducing fake application code or violating stage boundaries.

### Alternatives

- Exclude app services until applications are implemented.
- Add temporary demo applications.
- Let app containers exit immediately after `pnpm check`.

## 2026-06-24 - Docker Image Configuration Through Environment

### Problem

Production infrastructure should support future image pinning and updates without editing Compose structure.

### Decision

Expose `NODE_IMAGE`, `POSTGRES_IMAGE`, `REDIS_IMAGE`, and `MINIO_IMAGE` through env files and Compose build/image configuration.

### Reason

This makes CI/CD and production upgrades easier because image versions can be controlled through environment or deployment configuration.

### Alternatives

- Hardcode all image tags in Compose and Dockerfiles.
- Use only `latest` tags.
- Manage image versions only in CI scripts.

## 2026-06-24 - Shared Packages As Empty Boundaries

### Problem

The monorepo needs shared package boundaries, but adding API DTOs, UI components, or generic utilities too early would either violate the API approval rule or create premature abstractions.

### Decision

Create `@reviewo/types`, `@reviewo/shared`, and `@reviewo/ui` as compile-ready packages with empty public entry points. Keep `@reviewo/config` as the existing shared tooling configuration package.

### Reason

This makes package boundaries importable and testable while preserving YAGNI and preventing business logic or unapproved contracts from leaking into shared code.

### Alternatives

- Add initial API DTOs to `@reviewo/types`.
- Add common utility functions to `@reviewo/shared`.
- Add placeholder UI components to `@reviewo/ui`.
- Delay shared package creation until apps are implemented.

## 2026-06-24 - Backend Skeleton Without Domain Logic

### Problem

The backend needs a production-ready architectural foundation, but Stage 5 must not implement business behavior, DTOs, repositories, entities, auth, or database integration.

### Decision

Create `@reviewo/api` as a NestJS application with bootstrap, root module, config foundation, logger wrapper, health module, common infrastructure folders, and empty domain module shells.

### Reason

This establishes the modular monolith shape while keeping all domain behavior for later dedicated stages.

### Alternatives

- Generate full Nest resources for each domain.
- Start with only a single app module and add domain folders later.
- Add database/auth/swagger immediately.

## 2026-06-24 - Health Endpoint As The Only Stage 5 HTTP Endpoint

### Problem

Docker and future production deployment need a basic runtime check, but API contracts are not approved yet.

### Decision

Expose only `GET /health`, returning a minimal status response.

### Reason

Health is infrastructure-oriented and does not introduce product API behavior or domain contracts.

### Alternatives

- Add no HTTP endpoints.
- Add a root API endpoint.
- Add Swagger/OpenAPI documentation immediately.

## 2026-06-24 - Backend Logger Wrapper

### Problem

Modules should not become coupled to a specific logging implementation.

### Decision

Wrap the standard Nest `ConsoleLogger` in `AppLogger` and register it as the application logger.

### Reason

This keeps the current implementation simple while preserving a replacement path for structured logging later.

### Alternatives

- Use Nest logger directly everywhere.
- Add a third-party logger immediately.
- Delay logging setup.

## 2026-06-24 - Docker Dev Images Without Bind Mounts

### Problem

Development bind mounts hid image-installed `node_modules`, forcing containers to reinstall dependencies into a named volume and making `docker compose up` unreliable after dependency changes.

### Decision

Remove development bind mounts for now. `docker compose` and `make dev` use freshly built images. Live reload can be introduced later when real app development needs it.

### Reason

The current priority is reliable one-command startup. Rebuild-based development is acceptable at the skeleton stage and avoids container dependency drift.

### Alternatives

- Keep bind mounts and install dependencies on every container start.
- Keep a named `node_modules` volume.
- Add a more complex development entrypoint to synchronize dependencies.
