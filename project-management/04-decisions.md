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

Superseded on 2026-06-27 by "Docker Dev Volumes For Faster Iteration".

### Reason

The current priority is reliable one-command startup. Rebuild-based development is acceptable at the skeleton stage and avoids container dependency drift.

### Alternatives

- Keep bind mounts and install dependencies on every container start.
- Keep a named `node_modules` volume.
- Add a more complex development entrypoint to synchronize dependencies.

## 2026-06-27 - Docker Dev Volumes For Faster Iteration

### Problem

Rebuilding development images after every source code change slows backend development and smoke testing.

### Decision

Use bind-mounted source files in `docker-compose.dev.yml`, keep dependency folders in Docker named volumes, and mount a Docker-managed pnpm store. `make dev` now runs `docker compose up` without `--build`.

### Reason

This keeps production images immutable while making the development loop faster. Docker-managed dependency volumes avoid leaking Windows host `node_modules` into Linux containers.

### Alternatives

- Continue rebuilding images on every `make dev`.
- Bind mount the whole workspace without masking `node_modules`.
- Add a custom development entrypoint script before it is needed.

## 2026-06-24 - Prisma As ORM And Migration Tooling

### Problem

The backend needs a TypeScript-friendly PostgreSQL ORM and migration foundation before domain modules start using persistence.

### Decision

Use Prisma for database access and migrations.

### Reason

Prisma provides strong TypeScript integration, readable schema files, mature PostgreSQL support, convenient migrations, and good long-term maintainability.

### Alternatives

- TypeORM.
- Drizzle ORM.
- Raw SQL migrations with a lightweight query builder.

## 2026-06-24 - Prisma 7 Configuration

### Problem

Prisma 7 no longer supports datasource URLs inside `schema.prisma`, and runtime database access requires a driver adapter.

### Decision

Keep `schema.prisma` free of connection URLs, configure Prisma CLI through `apps/api/prisma.config.ts`, and instantiate `PrismaClient` with `@prisma/adapter-pg`.

### Reason

This follows current Prisma 7 architecture and keeps environment-specific connection data outside the schema.

### Alternatives

- Pin Prisma to an older major version.
- Use a non-Prisma migration tool.
- Hardcode connection values in scripts.

## 2026-06-24 - Database Infrastructure Without Domain Models

### Problem

Database infrastructure is needed now, but creating user/entity/rating tables would start domain implementation too early.

### Decision

Create only PostgreSQL schemas for future domains and keep Prisma schema without models in Stage 6.

### Reason

This preserves modular monolith data boundaries while keeping the stage focused on infrastructure.

### Alternatives

- Create all MVP tables immediately.
- Create only the `public` schema.
- Delay migrations until the first domain module.

## 2026-06-24 - Single Prisma Provider Through DI

### Problem

Future modules must not create their own database connections or bypass infrastructure boundaries.

### Decision

Expose `PrismaService` from a global `DatabaseModule` and let future modules consume database access through dependency injection.

### Reason

This centralizes connection lifecycle, shutdown behavior, and future instrumentation while keeping domain modules independent from connection setup.

### Alternatives

- Instantiate Prisma directly in repositories.
- Create one Prisma client per module.
- Delay DI integration until repositories are implemented.

## 2026-06-24 - Unified Backend Error Response Shape

### Problem

Future web and extension clients need predictable backend errors, but product API contracts are not ready yet.

### Decision

Define one infrastructure-level error response shape with `statusCode`, `error.code`, `error.message`, optional `error.details`, `path`, and `timestamp`.

### Reason

This gives clients and future API documentation a stable foundation without introducing product DTOs or domain endpoint contracts.

### Alternatives

- Let each controller build errors manually.
- Use Nest default exception responses.
- Delay error shape standardization until frontend integration.

## 2026-06-24 - Global Exception Filter

### Problem

Without centralized error handling, future controllers and modules would duplicate response formatting and risk leaking internal errors.

### Decision

Register a global Nest exception filter that normalizes known HTTP exceptions and unknown runtime errors into the shared error response shape.

### Reason

This keeps controllers focused on application behavior and ensures unknown errors are logged without exposing internal details to clients.

### Alternatives

- Add local filters per module.
- Handle errors manually in each controller.
- Keep only Nest default exception handling.

## 2026-06-24 - Centralized Validation Error Formatting

### Problem

Validation errors need to be machine-readable for future clients, but no DTOs or product API endpoints should be added in this stage.

### Decision

Configure the global `ValidationPipe` with a shared exception factory that returns `VALIDATION_ERROR` and a flattened list of validation details.

### Reason

This prepares consistent request validation behavior before DTOs are introduced, while keeping validation formatting separate from controllers and domain modules.

### Alternatives

- Use the default Nest validation error response.
- Format validation errors inside controllers.
- Delay validation formatting until the first product endpoint.

## 2026-06-26 - MVP Auth Approach

### Problem

Stage 8 needs a working authentication foundation, but OAuth, refresh tokens, sessions, roles, and permissions would expand the MVP scope.

### Decision

Use email/password authentication with a signed JWT access token for MVP.

### Reason

This supports the backend, future web app, and browser extension with a small contract and avoids premature session/OAuth infrastructure. Refresh tokens, OAuth providers, email verification, password reset, roles, and permissions can be added later without changing the current module boundaries.

### Alternatives

- Server-side sessions in PostgreSQL or Redis.
- OAuth-only authentication.
- Passwordless magic links.
- Add refresh tokens immediately.

## 2026-06-26 - Users/Auth Data Ownership

### Problem

Registration touches both user profile data and authentication identity data, but the modular monolith must preserve domain ownership.

### Decision

`users` owns `users.users`; `auth` owns `auth.user_auth_identities`. `AuthService` orchestrates registration and uses `UsersService` as the public user module boundary.

### Reason

This keeps user profile persistence and auth identity persistence separated while still allowing a complete MVP registration flow.

### Alternatives

- Put all account/auth data in one module.
- Let AuthModule write directly to users repositories.
- Delay registration until a more advanced account module exists.

## 2026-06-26 - Password Hashing Through Node Crypto

### Problem

MVP password storage needs secure hashing, but adding native password hashing dependencies can complicate Docker and Windows development early.

### Decision

Use Node's built-in `scrypt` with per-password random salt for Stage 8 password hashing.

### Reason

This avoids premature external dependencies while keeping password hashes non-reversible and versioned for future migration.

### Alternatives

- Add `bcrypt`.
- Add `argon2`.
- Delegate all auth to an external provider.

## 2026-06-26 - API Port Mapping Follows `API_PORT`

### Problem

When `API_PORT` is overridden, the Nest API listens on the overridden container port, but Compose previously mapped the host port to container port `3000`.

### Decision

Map the API service as `${API_PORT}:${API_PORT}` in Docker Compose.

### Reason

This keeps app runtime configuration and Docker port mapping aligned and allows isolated smoke tests or local development to use alternate API ports.

### Alternatives

- Keep the container port hardcoded to `3000`.
- Split host and container API port variables.
- Force the API to always listen on `3000` in containers.

## 2026-06-26 - Stage 9 Entity MVP Model

### Problem

Entity is the central domain of the platform, but adding links, aliases, graph relations, versions, tags, moderation, ratings, reviews, and trust in the same stage would make the core model too broad.

### Decision

Stage 9 implements only `entities.entities` with `id`, `title`, `slug`, `type`, `description`, `canonical_url`, `parent_id`, `created_by`, `created_at`, and `updated_at`.

### Reason

This gives the platform a usable central object while preserving a clean path to add URL normalization, links, graph relations, ratings, reviews, and trust in later stages.

### Alternatives

- Implement `entity_links` and aliases immediately.
- Implement `entity_relations` immediately.
- Add categories/tags as part of the entity stage.

## 2026-06-26 - Entity Type As PostgreSQL Enum

### Problem

MVP needs a bounded set of entity types, but a separate category/type management domain would be premature.

### Decision

Store entity type as `entities.entity_type` enum with the approved MVP values.

### Reason

This keeps validation and storage simple while allowing a later migration to a more flexible type system if needed.

### Alternatives

- Store type as free text.
- Add a separate `entity_types` table.
- Delay type support.

## 2026-06-26 - Single Canonical URL In Stage 9

### Problem

Entities need a canonical URL, but URL normalization, aliases, and multiple links are part of later scope.

### Decision

Stage 9 stores one optional `canonical_url` on `entities.entities`. It does not create `entity_links`, URL aliases, or site-specific normalization logic.

### Reason

This follows the user's Stage 9 scope and keeps URL normalization isolated for Stage 10.

### Alternatives

- Add `entity_links` now.
- Add URL alias support now.
- Delay canonical URL storage until Stage 10.

## 2026-06-26 - Entity API Access Rules

### Problem

Entity creation needs ownership attribution through `created_by`, while entity reads should be available for public pages and future extension lookup.

### Decision

`POST /entities` requires JWT authentication and uses the current user's id as `created_by`. `GET /entities/:id` and `GET /entities/search` are public.

### Reason

This keeps entity creation accountable without blocking public entity page reads.

### Alternatives

- Make all entity endpoints public.
- Require authentication for reads.
- Delay `created_by` until moderation/auth is more advanced.

## 2026-06-26 - Simple PostgreSQL Entity Search

### Problem

Users must be able to find entities, but OpenSearch and advanced ranking are outside MVP Stage 9.

### Decision

Use Prisma/PostgreSQL filtering against `title`, `slug`, and `canonical_url`, limited to a small result set.

### Reason

This provides a verifiable MVP search path without introducing new infrastructure or duplicating future Search Module responsibilities.

### Alternatives

- Add OpenSearch immediately.
- Implement full-text ranking in Stage 9.
- Delay search until a dedicated Search Module stage.

## 2026-06-26 - EntitiesPort Boundary

### Problem

Future modules will need entity data, but direct repository access would violate modular monolith boundaries.

### Decision

Expose an `EntitiesPort` token/interface from `EntitiesModule`; future modules should depend on this public boundary instead of `EntitiesRepository`.

### Reason

This keeps repository details private to the entity domain and preserves the future microservice extraction path.

### Alternatives

- Export `EntitiesRepository`.
- Let future modules query Prisma directly.
- Add no public entity interface until another module needs it.

## 2026-06-26 - URL Normalization MVP

### Problem

Equivalent URLs with tracking parameters or small formatting differences can create duplicate entities if stored as-is.

### Decision

Add an isolated default URL normalizer inside `EntitiesModule` and normalize `canonical_url` before entity creation and URL-aware search.

### Reason

This keeps URL logic near the entity domain, prevents obvious duplicate entities, and avoids creating a separate URL/domain service before there is a real cross-module need.

### Alternatives

- Keep canonical URLs exactly as submitted.
- Add `entity_links` and aliases immediately.
- Create a separate URL service/module in Stage 10.

## 2026-06-26 - Default URL Normalization Rules

### Problem

The MVP needs deterministic canonical URLs without site-specific parsers.

### Decision

Use the standard `URL` API, canonicalize to `https`, lowercase hostnames, remove one leading `www`, remove hash fragments, remove non-root trailing slashes, remove known tracking query parameters, and sort preserved query parameters.

### Reason

These rules cover common duplicate cases while avoiding assumptions about site-specific URL semantics.

### Alternatives

- Add site-specific URL parsing immediately.
- Remove all query parameters.
- Preserve submitted URLs unchanged.

## 2026-06-26 - URL Lookup Uses Exact Canonical URL

### Problem

After normalization, entity lookup should be predictable and not depend on fuzzy matching.

### Decision

Look up existing entities by exact normalized `canonical_url`. If `POST /entities` receives an equivalent URL for an existing entity, return `409 CONFLICT` with the existing `entityId` in error details.

### Reason

This keeps `POST /entities` a creation endpoint while still preventing duplicate canonical URLs.

### Alternatives

- Return the existing entity from `POST /entities`.
- Add a dedicated resolve endpoint in Stage 10.
- Use fuzzy URL matching.

## 2026-06-26 - Future Site-Specific Normalizers

### Problem

Future URLs for YouTube, GitHub, stores, products, and posts may need special canonicalization, but adding those parsers now would exceed Stage 10 scope.

### Decision

Keep Stage 10 as a default normalizer behind a `UrlNormalizer` interface/token. Site-specific normalizers can be added later through a separate RFC.

### Reason

This preserves a clean extension point without adding unvalidated complexity.

### Alternatives

- Add YouTube/GitHub normalizers immediately.
- Hardcode site-specific cases in the default normalizer.
- Delay the normalizer interface until site-specific support is needed.

## 2026-06-26 - Ratings MVP Scale And Repeat Voting

### Problem

The MVP needs a simple rating model that is easy for users and simple to aggregate.

### Decision

Use integer ratings from `1` to `5`. A user can have one active rating per entity. Re-rating the same entity updates the existing rating.

### Reason

This matches the approved MVP scope and avoids rating history or fractional score complexity before the main product flow is validated.

### Alternatives

- Support fractional ratings.
- Allow multiple ratings per user per entity.
- Keep rating history in Stage 11.

## 2026-06-26 - Ratings Data Ownership

### Problem

Ratings depend on entities but must not leak rating logic into the Entity Module.

### Decision

Store raw ratings in `ratings.ratings` and aggregates in `ratings.rating_aggregates`. Entity Module does not store or calculate rating values.

### Reason

This keeps ratings as an independent domain and preserves the path to extracting Ratings as a separate service later.

### Alternatives

- Store average rating directly on `entities.entities`.
- Let Entity Module recalculate rating aggregates.
- Delay aggregate storage and calculate on every request.

## 2026-06-26 - Ratings Use EntitiesPort

### Problem

Ratings must validate that an entity exists without crossing module boundaries.

### Decision

Ratings Module depends on `EntitiesPort.findEntityById()` and does not import or use `EntitiesRepository`.

### Reason

This keeps module boundaries clear and avoids direct repository access across domains.

### Alternatives

- Query `entities.entities` directly from RatingsRepository.
- Import `EntitiesRepository`.
- Skip entity existence validation.

## 2026-06-26 - Ratings Aggregate Recalculation

### Problem

Rating aggregates must stay correct after create/update, but incremental aggregate updates are easier to get wrong.

### Decision

After each create/update, recalculate the aggregate for the affected entity inside the same transaction using current ratings grouped by score.

### Reason

This is simple, correct for MVP scale, and can later be replaced with event-driven or incremental aggregation without changing the API.

### Alternatives

- Increment/decrement aggregate counters manually.
- Recalculate aggregates asynchronously through events immediately.
- Do not store aggregates in MVP.

## 2026-06-26 - Reviews Are Independent From Ratings

### Problem

The MVP needs text reviews, but review data must not duplicate or mix with numeric rating behavior.

### Decision

Keep Reviews Module as a separate domain. Reviews store textual opinions only in `reviews.reviews`. Ratings stay in Ratings Module and are not read, written, or recalculated by Reviews Module.

### Reason

This preserves the `Review != Rating` boundary and keeps both modules independently extractable later.

### Alternatives

- Store review text together with user ratings.
- Let Reviews Module read rating tables to enrich review responses.
- Move rating/review summary data into Entity Module.

## 2026-06-26 - One Review Per Author Per Entity

### Problem

The MVP needs a simple repeat-review policy that avoids duplicate reviews from the same user on the same entity.

### Decision

Use `UNIQUE(author_id, entity_id)` on `reviews.reviews`. `PUT /reviews/entities/:entityId/my-review` creates the current user's review if missing and updates it if it already exists.

### Reason

This keeps the user experience simple and avoids review history/versioning before moderation and audit requirements are designed.

### Alternatives

- Allow multiple reviews per user per entity.
- Keep full edit history in Stage 12.
- Reject repeated review submission instead of updating.

## 2026-06-26 - Review Likes Use Separate Votes Table

### Problem

Reviews need usefulness feedback, but dislikes and richer reactions are excluded from the MVP.

### Decision

Store review likes in `reviews.review_votes` with `UNIQUE(review_id, user_id)`. `POST /reviews/:reviewId/like` is idempotent and `DELETE /reviews/:reviewId/like` removes the current user's like if present.

### Reason

This supports useful-review sorting without introducing reaction types, dislike semantics, or review rating systems.

### Alternatives

- Store `likes_count` directly on `reviews.reviews`.
- Add reaction type enum immediately.
- Add dislikes in Stage 12.

## 2026-06-26 - Reviews Use EntitiesPort

### Problem

Reviews must verify entity existence without crossing into Entity Module persistence internals.

### Decision

Reviews Module depends on `EntitiesPort.findEntityById()` and does not import or use `EntitiesRepository`.

### Reason

This keeps module boundaries consistent with Ratings Module and supports future service extraction.

### Alternatives

- Query `entities.entities` directly from ReviewsRepository.
- Import `EntitiesRepository`.
- Skip entity existence validation.

## 2026-06-26 - Reviews Sorted By Likes

### Problem

The MVP needs a default ordering for entity reviews that surfaces useful reviews first.

### Decision

Sort `GET /reviews/entities/:entityId` by review likes count descending, then by `updated_at` descending as a deterministic tiebreaker.

### Reason

This matches the approved MVP requirement while keeping the query simple and PostgreSQL-backed.

### Alternatives

- Sort only by creation date.
- Add configurable sorting in Stage 12.
- Add a separate review ranking algorithm immediately.

## 2026-06-26 - Trust Confidence Response Format

### Problem

The MVP needs a trust indicator that can be returned consistently by the API without locking the product into a final scoring system.

### Decision

Return trust as `{ "confidence": number }`, where `confidence` is a decimal number from `0` to `1`, rounded to two decimals.

### Reason

A normalized decimal is easy for API clients to display as a percentage while keeping the API contract independent from UI formatting.

### Alternatives

- Return an integer from `0` to `100`.
- Return labels such as `low`, `medium`, and `high`.
- Return internal formula components in the public API.

## 2026-06-26 - Trust MVP Formula

### Problem

The first trust score must be simple, monotonic, bounded, and explainable while using only approved MVP signals.

### Decision

Calculate confidence as `min(1, min(votesCount, 100) / 100 * 0.9 + min(reviewCount, 20) / 20 * 0.1)`, rounded to two decimals.

### Reason

Rating count is the primary signal for confidence in a rating, while review count adds a small supporting contribution. The formula is predictable and can be replaced later without changing the API response shape.

### Alternatives

- Use account reputation or account age.
- Use text analysis or anti-fraud signals.
- Persist and update trust scores through events in Stage 13.
- Use a logarithmic or ML-based formula immediately.

## 2026-06-26 - Trust Reads Data Through Ports

### Problem

Trust confidence depends on rating and review counts, but Trust Module must not own or query Ratings/Reviews persistence directly.

### Decision

Trust Module uses `RatingsPort.getAggregate(entityId)` for rating count and `ReviewsPort.getReviewCountForEntity(entityId)` for review count. It does not import rating/review repositories or read their tables.

### Reason

This keeps Trust as a separate domain and preserves module boundaries for future service extraction.

### Alternatives

- Query `ratings.rating_aggregates` directly from Trust Module.
- Query `reviews.reviews` directly from Trust Module.
- Move trust calculation into Entity Module.

## 2026-06-26 - Trust MVP Has No Persistence

### Problem

The roadmap previously mentioned a `trust_scores` table, but the approved Stage 13 scope only needs on-demand MVP confidence from current rating/review counts.

### Decision

Do not create `trust_scores` persistence in Stage 13. `GET /trust/entities/:entityId` calculates confidence on demand through public ports.

### Reason

This avoids premature storage and event synchronization before the trust algorithm is stable.

### Alternatives

- Add `trust.trust_scores` immediately.
- Recalculate trust through domain events in Stage 13.
- Store trust confidence on `entities.entities`.

## 2026-06-27 - In-Process Domain Event Bus

### Problem

The modular monolith needs a low-coupling communication foundation before introducing search composition, future trust recalculation, notifications, moderation, or service extraction.

### Decision

Add a minimal in-process `DomainEventBus` with `publish` and `subscribe`. Domain events are plain data contracts with `name`, `occurredAt`, and `payload`.

### Reason

This prepares a future migration to a broker or outbox without introducing distributed systems complexity before there is a concrete need.

### Alternatives

- Add RabbitMQ/Kafka/NATS immediately.
- Add a persisted outbox table immediately.
- Keep all future module communication as direct service calls.

## 2026-06-27 - Domain Events Publish After Persistence

### Problem

Domain events should represent facts that have already happened, not requested operations that may still fail.

### Decision

Publish `EntityCreated`, `RatingCreated`, `RatingUpdated`, `ReviewCreated`, and `ReviewUpdated` after successful persistence. Rating events publish after the rating transaction commits.

### Reason

This keeps event semantics predictable and avoids subscribers reacting to failed writes.

### Alternatives

- Publish before persistence.
- Publish from repositories.
- Publish inside database transactions.

## 2026-06-27 - No Event-Driven Reactions Yet

### Problem

The roadmap mentioned trust and aggregate reactions, but current MVP behavior already has clear ownership: rating aggregates are transaction-local in Ratings Module and trust is calculated on demand.

### Decision

Stage 14 creates event infrastructure and publish points only. It does not move rating aggregate recalculation or trust confidence calculation into event handlers.

### Reason

This avoids weakening consistency or adding speculative handlers before there is a concrete consumer. Future stages can subscribe to the existing events without rewriting domain flows.

### Alternatives

- Move rating aggregates to event handlers immediately.
- Persist trust scores and recalculate them from events immediately.
- Add placeholder subscribers with no behavior.

## 2026-06-27 - Search Module Uses EntitiesPort

### Problem

The MVP needs a dedicated home-page search endpoint, but entity search rules and URL normalization already belong to the Entity Module.

### Decision

Search Module depends on `EntitiesPort.searchEntities(query)` and does not import or use `EntitiesRepository`.

### Reason

This keeps Search as an application-facing module while preserving Entity Module ownership of entity lookup rules and persistence.

### Alternatives

- Query `entities.entities` directly from Search Module.
- Move entity repository access into Search Module.
- Keep only `GET /entities/search` and skip Search Module.

## 2026-06-27 - Search Fallback Is A Hint Only

### Problem

The home page needs a fallback flow for creating a new page when no entity is found, but Search Module must not own entity creation business logic.

### Decision

`GET /search/entities` returns `canCreateEntity: true` when the result list is empty. It does not create entities or prepare creation DTOs.

### Reason

This gives clients enough information for the MVP fallback UX while keeping creation inside Entity Module.

### Alternatives

- Let Search Module create missing entities.
- Return a generated create-entity payload from Search Module.
- Omit fallback information from the API.

## 2026-06-27 - Search Remains PostgreSQL-Backed

### Problem

The roadmap includes more advanced search later, but MVP search should stay simple and rely on existing persistence.

### Decision

Search Module reuses the existing PostgreSQL-backed Entity Module search. OpenSearch, indexing workers, and search-specific persistence are not added in Stage 15.

### Reason

This keeps the MVP small and avoids premature infrastructure before search requirements are validated.

### Alternatives

- Add OpenSearch immediately.
- Add a dedicated search index table.
- Add asynchronous indexing from domain events in Stage 15.

## 2026-06-27 - Entity Page Composition Layer

### Problem

The frontend needs one endpoint for the entity page, but entity, ratings, reviews, and trust must remain separate domains.

### Decision

Add `GET /entities/:entityId/page` in a dedicated composition module. The composition service reads data through `EntitiesPort`, `RatingsPort`, `ReviewsPort`, and `TrustPort`.

### Reason

This gives clients a single page payload while keeping domain ownership and repository boundaries intact.

### Alternatives

- Let frontend call each domain endpoint separately.
- Put composition logic inside Entity Module.
- Read domain repositories directly from the composition layer.

## 2026-06-27 - Entity Page Reviews Are Limited

### Problem

Returning all reviews from the entity page endpoint would become expensive as review counts grow.

### Decision

Return only the top 10 reviews in `reviews` and include `meta.reviewsCount` for the total count.

### Reason

This keeps the MVP page endpoint lightweight while still giving clients enough data for summary UI. Paginated review loading can be added later as a separate endpoint.

### Alternatives

- Return all reviews in the entity page response.
- Add paginated reviews to Stage 16 immediately.
- Return no reviews in the entity page response.

## 2026-06-27 - TrustPort For Composition

### Problem

Entity page composition needs trust confidence, but it should not depend on a concrete Trust service or duplicate trust formula logic.

### Decision

Expose `TrustPort` from Trust Module and inject it into Entity Page composition.

### Reason

This keeps trust calculation owned by Trust Module and preserves the public-interface rule between modules.

### Alternatives

- Inject `TrustService` directly.
- Recalculate confidence in the composition layer.
- Omit trust from the entity page response.

## 2026-06-27 - Extension API As A Thin Backend Layer

### Problem

The browser extension needs a compact API surface, but backend domain modules must remain the source of business logic.

### Decision

Add a dedicated Extension API module with `GET /extension/resolve?url=...` and `PUT /extension/entities/:entityId/my-rating`. The module composes data through public ports and does not access repositories.

### Reason

This gives the extension a stable MVP contract while keeping entity lookup, rating writes, and trust calculation owned by their existing modules.

### Alternatives

- Let the extension call several domain endpoints directly.
- Put extension-specific behavior into Entity Module.
- Let Extension API read domain repositories directly.

## 2026-06-27 - Extension URL Resolution Belongs To Entity Module

### Problem

URL normalization and canonical URL matching are entity-domain rules, but the extension needs URL-based resolution.

### Decision

Expose URL resolution through `EntitiesPort.resolveEntityByUrl(url)`.

### Reason

This avoids duplicating normalization rules in Extension API and keeps canonical URL lookup owned by Entity Module.

### Alternatives

- Inject `URL_NORMALIZER` and `EntitiesRepository` into Extension API.
- Duplicate URL normalization in Extension API.
- Reuse search endpoint response shape directly.

## 2026-06-27 - Extension Quick Rating Uses RatingsPort

### Problem

The extension needs quick rating, but rating write rules include ownership checks, upsert behavior, aggregate recalculation, and domain events.

### Decision

Expose rating writes through `RatingsPort.rateEntity(...)` and use that from Extension API.

### Reason

This keeps rating invariants inside Ratings Module and avoids a second rating write path.

### Alternatives

- Write ratings directly from Extension API.
- Duplicate rating service logic in Extension API.
- Force extension to call the generic ratings endpoint only.

## 2026-06-27 - No Extension Auto-Creation Or Site Parsers

### Problem

The extension can encounter URLs that do not match an existing entity, but auto-creation and site-specific detection would expand MVP scope.

### Decision

For missing URLs, `GET /extension/resolve` returns `not_found`, canonical URL data, and `canCreateEntity: true`. Stage 17 does not create entities, add site-specific parsers, or add extension tables.

### Reason

This supports the first extension flow while keeping creation and parser complexity for later dedicated stages.

### Alternatives

- Auto-create entities from URL resolution.
- Add parser-specific entity detection immediately.
- Add extension persistence tables in Stage 17.

## 2026-06-27 - Web Uses Next.js App Router

### Problem

The roadmap requires a web frontend foundation before product pages and search UI can be implemented.

### Decision

Create `@reviewo/web` as a Next.js App Router application with TypeScript, root layout, global styles, and a minimal placeholder page.

### Reason

This establishes the web application boundary without adding product flows before their dedicated stages.

### Alternatives

- Use a custom React/Vite app.
- Add full home/search UI immediately.
- Delay web framework setup until product UI stages.

## 2026-06-27 - Web API Access Goes Through Client Boundary

### Problem

Frontend components need API data later, but direct `fetch` calls inside components would duplicate transport details and make flows harder to test.

### Decision

Add a base API client under `apps/web/src/lib/api` and keep direct `fetch` out of React components.

### Reason

This preserves the backend as the business logic source while giving future feature code one place for API transport behavior.

### Alternatives

- Call `fetch` directly from components.
- Generate API clients before contracts are stable.
- Put API helpers into shared packages immediately.

## 2026-06-27 - Frontend Skeleton Avoids Product Flows

### Problem

Stage 18 needs to prove the web app starts, but adding search, auth, entity pages, or rating UI would overlap later roadmap stages.

### Decision

Stage 18 includes only routing, layout, providers, TanStack Query, API client foundation, and a minimal placeholder page.

### Reason

This keeps the frontend foundation small and makes later UI stages easier to review independently.

### Alternatives

- Build the home/search UI in Stage 18.
- Add auth UI in Stage 18.
- Add entity page UI in Stage 18.

## 2026-06-27 - Home Search Uses Backend Search API

### Problem

The web home page needs live entity search, but search rules and URL-aware behavior belong to the backend.

### Decision

Implement the home search UI against `GET /search/entities?query=...` through a feature-level API function and TanStack Query hook.

### Reason

This keeps frontend code focused on presentation and state while preserving backend ownership of search behavior.

### Alternatives

- Search directly against entity endpoints from components.
- Duplicate search normalization in the frontend.
- Add OpenSearch or frontend-side indexing.

## 2026-06-27 - Home Search Is Feature-Scoped

### Problem

The frontend needs a scalable structure before more screens are added.

### Decision

Put home search code under `apps/web/src/features/home-search` with local `api`, `hooks`, `components`, and `types` folders.

### Reason

This follows the feature-based frontend architecture while avoiding premature shared abstractions.

### Alternatives

- Put all home search files directly in `src/app`.
- Move DTOs into `@reviewo/types` immediately.
- Create a global search package before reuse exists.

## 2026-06-27 - Search Missing State Does Not Create Entities

### Problem

The home page should guide users when no entity is found, but manual entity creation is a separate roadmap stage.

### Decision

Show a create-page hint when `canCreateEntity` is true, but do not implement the creation flow in Stage 19.

### Reason

This matches the backend Search API contract and keeps Stage 20 responsible for entity creation.

### Alternatives

- Create entities directly from search.
- Link to a non-existent entity creation page.
- Hide the create hint until Stage 20.

## 2026-06-27 - API Enables CORS For Web Origin

### Problem

The browser web app runs on `localhost:3001` and needs to call the API on `localhost:3000`.

### Decision

Add `CORS_ALLOWED_ORIGINS` and enable CORS in API bootstrap when allowed origins are configured.

### Reason

This enables browser-based frontend/API integration without weakening domain boundaries.

### Alternatives

- Proxy all API calls through Next.js.
- Disable browser integration until deployment.
- Allow all origins unconditionally.

## 2026-06-27 - Entity Creation Includes Minimal Auth Flow

### Problem

Backend entity creation requires JWT authentication, but the full web auth/profile experience is not implemented yet.

### Decision

Stage 20 adds a minimal register/login block inside the entity creation flow only. The received access token is stored locally for this MVP creation flow.

### Reason

This allows real entity creation through the existing protected backend endpoint without weakening backend auth rules or adding a full auth product surface ahead of schedule.

### Alternatives

- Add a full auth section before entity creation.
- Add a temporary bearer-token text field.
- Make backend entity creation public.

## 2026-06-27 - Entity Creation Uses Backend Validation

### Problem

The web form needs to submit entity data but must not duplicate backend business rules.

### Decision

The web form collects title, type, optional canonical URL, and optional description, then submits to `POST /entities`. Backend validation, canonical URL normalization, slug generation, and duplicate checks remain authoritative.

### Reason

This keeps frontend logic focused on UX and preserves backend ownership of business rules.

### Alternatives

- Reimplement entity validation and normalization in the frontend.
- Generate slugs in the frontend.
- Add a new frontend-specific entity creation endpoint.

## 2026-06-27 - Entity Route Placeholder Until Stage 21

### Problem

Stage 20 should redirect after successful creation, but the full entity page is a separate Stage 21 deliverable.

### Decision

Add a minimal `/entities/:id` placeholder route after creation. The full entity page UI remains Stage 21.

### Reason

This preserves the user flow after creation without prematurely implementing rating, trust, reviews, or entity page composition UI.

### Alternatives

- Redirect back to home after creation.
- Implement the full entity page in Stage 20.
- Redirect to a route that returns 404 until Stage 21.

## 2026-06-27 - Web Entity Page Uses Composition API

### Problem

The web entity page needs entity, rating, trust, reviews, and review count data without duplicating backend composition logic in the frontend.

### Decision

Use `GET /entities/:entityId/page` as the primary data source for the web entity page.

### Reason

This preserves backend ownership of page composition and keeps the frontend focused on rendering and interaction state.

### Alternatives

- Call entity, rating, trust, and review endpoints independently from the page.
- Duplicate page composition rules in frontend code.
- Add a Next.js API route as an extra composition layer.

## 2026-06-27 - Minimal Web Auth Is Shared Across Interaction Flows

### Problem

Entity creation, rating, and review writes all require JWT authentication, but a full profile/auth product surface is not part of Stage 21.

### Decision

Move the minimal register/login panel and local auth session handling into `apps/web/src/features/auth`, then reuse it from entity creation and entity page interactions.

### Reason

This removes duplicated auth UI and storage code while keeping auth intentionally lightweight until the dedicated profile/auth stages.

### Alternatives

- Keep separate auth implementations per feature.
- Add a full global auth shell in Stage 21.
- Use temporary bearer-token fields for rating/review forms.

## 2026-06-27 - Rating And Review Forms Use Backend Write APIs

### Problem

The entity page needs user interaction forms, but rating aggregate updates and review invariants belong to backend modules.

### Decision

The web page writes ratings through `PUT /ratings/entities/:entityId/my-rating` and reviews through `PUT /reviews/entities/:entityId/my-review`, then invalidates TanStack Query data for the composed entity page and current user state.

### Reason

This keeps aggregate recalculation, one-rating-per-user, and one-review-per-user rules in the backend while giving the web page fresh data after writes.

### Alternatives

- Calculate rating aggregates optimistically in frontend state.
- Append reviews locally without refetching composition data.
- Add frontend-specific write endpoints.

## 2026-06-27 - Web Profile Is Read-Only In MVP

### Problem

The roadmap calls for a minimal web profile, but profile editing and user activity feeds would require additional backend contracts.

### Decision

Stage 22 implements a read-only `/profile` page that loads current user data through existing `GET /auth/me`.

### Reason

This gives users a real account page without adding premature profile editing, account settings, or user activity APIs.

### Alternatives

- Add profile editing endpoints in Stage 22.
- Add user-scoped rating/review activity endpoints in Stage 22.
- Build a profile placeholder without calling the API.

## 2026-06-27 - Profile Reuses Shared Minimal Web Auth

### Problem

The profile page requires an access token, but the full auth product surface is still outside the current scope.

### Decision

Reuse the shared minimal web auth panel and stored auth session from `apps/web/src/features/auth`.

### Reason

This keeps auth behavior consistent across creation, entity interactions, and profile without adding a global auth shell or account settings.

### Alternatives

- Create a separate profile-only login form.
- Add a global authenticated navigation shell.
- Use a temporary bearer-token field on the profile page.

## 2026-06-27 - Extension Skeleton Uses Chrome MV3 Entry Points

### Problem

The browser extension needs a loadable foundation before URL detection, backend integration, or rating card UI can be added.

### Decision

Stage 23 creates `@reviewo/extension` with Manifest V3 `background`, `content`, and `popup` entry points plus a local build output under `apps/extension/dist`.

### Reason

This establishes the minimum extension package structure and build pipeline required for later Chrome loading and feature stages.

### Alternatives

- Delay extension code until URL detection is implemented.
- Use a single bundled script for all extension behavior.
- Add product popup UI in Stage 23.

## 2026-06-27 - Extension Messaging Uses Shared Contracts

### Problem

Background, content, and popup scripts need a minimal communication path without introducing backend or product logic.

### Decision

Add shared message contracts under `apps/extension/src/shared` and implement ping/pong messaging between content/popup and the background worker.

### Reason

This verifies the extension runtime wiring while keeping business logic out of the skeleton stage.

### Alternatives

- Use ad hoc string messages without shared contracts.
- Call backend APIs directly from content scripts in Stage 23.
- Defer all messaging until Stage 24.

## 2026-06-27 - Extension URL Resolve Runs In Background Worker

### Problem

The extension needs to detect the current page URL and resolve it against the backend without putting API calls or business logic in content scripts.

### Decision

Content scripts read the current HTTP/HTTPS page URL and send a resolve message to the background worker. The background worker calls backend `GET /extension/resolve?url=...` and returns the result through extension messaging.

### Reason

This keeps backend communication centralized in the background worker and matches the Chrome MV3 architecture used by later extension stages.

### Alternatives

- Call the backend directly from content scripts.
- Resolve URLs only from the popup.
- Add site-specific URL parsers in Stage 24.

## 2026-06-27 - Extension Resolve Results Feed Future Card UI Through Events

### Problem

Stage 24 must pass resolve results toward future card UI without implementing the card itself.

### Decision

The content script publishes a `reviewo:resolve-result` browser event with the backend resolve payload after a successful background resolve. The background worker also caches resolve results per tab for popup reads.

### Reason

This gives Stage 25 a stable integration point while keeping Stage 24 focused on URL detection and backend resolve only.

### Alternatives

- Inject card UI immediately in Stage 24.
- Store resolve results only in popup-local state.
- Persist resolve cache across browser restarts.

## 2026-06-27 - Lazy Entity Creation RFC Confirmed

### Problem

Manual entity creation adds friction in the extension flow. Lazy creation must be designed before implementation without breaking the existing resolve and rating card stages.

### Decision

Approve `docs/11-rfc/0007-lazy-entity-creation.md` with confirmed product and architecture choices:

- Lazy creation triggers on first authenticated rating or review, not on resolve.
- Default lazy entity type is `website`.
- Title uses minimal sanitization only (trim, collapse spaces, max 200).
- Extension-first delivery; web reuses the same application use case later.
- Manual `POST /entities` remains as fallback for admins, moderators, and catalog seeding.
- SEO/noindex for low-activity entities is a future decision; implementation deferred.
- Orchestration lives in application use cases (e.g. `RateSiteUseCase`); Ratings/Reviews must not call Entities for provisioning.
- Implementation is **Stage 28**, after Stages 25–27 (rating card, extension auth, submit rating for existing entities).

### Reason

This preserves modular monolith boundaries, minimizes risk to working resolve, and sequences extension UX before entity provisioning changes.

### Alternatives

- Implement lazy creation immediately after Stage 24.
- Let Ratings module call Entities directly.
- Default lazy type to `page`.
- Remove manual entity creation.

## 2026-06-27 - Extension Roadmap Split Before Lazy Creation

### Problem

The previous roadmap combined extension quick rating and lazy creation implicitly in one stage, increasing risk to resolve and card UI stability.

### Decision

Split extension delivery into:

1. Stage 25 — Extension Rating Card MVP
2. Stage 26 — Extension Authentication
3. Stage 27 — Extension Submit Rating (existing entities only)
4. Stage 28 — Lazy Entity Creation (RFC 0007)

Moderation, testing, E2E, production readiness, and stabilization shift to Stages 29–33.

### Reason

Each stage has a narrow verification surface. Resolve and found-entity rating work before URL-scoped entity provisioning is introduced.

### Alternatives

- Keep single "Extension Quick Rating" stage covering auth, rating, and lazy creation.
- Implement lazy creation before extension auth.

## 2026-06-27 - Extension Rating Card Uses Shadow DOM In Content Script

### Problem

The extension needs a compact on-page rating card that shows resolve data without leaking styles to or from the host page.

### Decision

Render the Stage 25 rating card from the content script using a fixed-position host element with Shadow DOM, fed by the existing resolve result flow. Show the card only for `found` entities.

### Reason

This keeps card UI isolated from arbitrary site CSS, matches the Stage 24 resolve integration point, and avoids backend or API changes in Stage 25.

### Alternatives

- Inject global CSS into the host page.
- Render the card in the popup only.
- Show lazy-creation CTA for `not_found` in Stage 25.

## 2026-06-27 - Extension Web Links Use Build-Time Web Base URL

### Problem

The rating card **More details** action must open the web entity page, which runs on a different origin than the API during local development.

### Decision

Add `EXTENSION_WEB_BASE_URL` to the extension build (default `http://localhost:3001`) and compose entity page links from resolve `web.entityPagePath`.

### Reason

This keeps web link generation explicit and environment-configurable without hardcoding API origin as the web origin.

### Alternatives

- Hardcode `http://localhost:3001` in content script source.
- Ask the backend resolve endpoint to return absolute web URLs.

## 2026-06-27 - Extension Auth Uses Background Worker And chrome.storage.local

### Problem

The extension needs authenticated backend writes without exposing tokens to arbitrary page scripts or duplicating auth logic in popup and content contexts.

### Decision

Store extension auth sessions in `chrome.storage.local` under `reviewo.extensionAuth`. Handle register/login/sign-out and authenticated API requests in the background worker through extension messaging.

### Reason

This centralizes token access in the background worker, matches MV3 security boundaries, and prepares Stage 27 rating writes without adding a new auth model.

### Alternatives

- Store tokens in popup `localStorage` only.
- Perform authenticated fetches directly from content scripts.
- Build full auth product UI in Stage 26.

## 2026-06-27 - Extension Rating Writes Use Background Messaging Only

### Problem

The rating card must submit ratings without calling the backend directly from page context or breaking the resolve-first architecture.

### Decision

Rating card sends scores through background `AUTHENTICATED_API_REQUEST` to `PUT /extension/entities/:entityId/my-rating`, then updates displayed aggregates from the quick-rating response.

### Reason

This keeps tokens and authenticated fetches in the background worker while preserving the card as a presentation layer over resolve and write results.

### Alternatives

- Call the rating endpoint directly from the content script.
- Add a dedicated rating-card fetch helper inside the card module.
- Enable lazy creation for `not_found` in Stage 27.

## 2026-06-27 - Stage 28 Lazy Entity Creation Implemented Per RFC 0007

### Problem

Unknown URLs resolve as `not_found`, blocking extension rating until manual entity creation. Lazy creation must preserve domain boundaries, URL normalization parity with resolve, and concurrency safety.

### Decision

Implement RFC 0007 in Stage 28:

- `EntitiesPort.ensureEntityForUrl` owns provisioning in Entities domain using existing `UrlNormalizationService`.
- `RateSiteUseCase` in Extension API orchestrates ensure → rate → trust.
- New `PUT /extension/entities/by-url/my-rating` endpoint; existing `PUT /extension/entities/:entityId/my-rating` unchanged.
- `createdBy` is the authenticated user who initiated the first lazy action.
- P2002 unique constraint on canonical URL triggers re-fetch of existing entity (concurrency recovery).
- Extension card supports `not_found` rating flow and switches to `found` in-place after success.
- Resolve remains read-only; web lazy flows deferred.

### Reason

This matches RFC 0007, keeps Ratings working only with `entityId`, and sequences extension UX after found-entity rating was proven in Stage 27.

### Alternatives

- Let Ratings module call Entities repository directly.
- Create entities on resolve instead of first rating.
- Implement web lazy creation in the same stage.

## 2026-06-27 - RFC 0008 Content Hiding Narrowed Stage 29 Scope

### Problem

"Moderation" easily expands into reports, queues, roles, admin UI, and multiple follow-on stages. After Stage 28 the MVP core is complete; the next need is simply removing spam entities and reviews.

### Decision

Before Stage 29 code, propose **RFC 0008 — Content Hiding**:

- Stage 29 = hide junk entity + hide junk review only.
- Status model: `ACTIVE` | `HIDDEN` on entity and review rows.
- Admin-only hide/unhide API; no reports, queues, workflow, or admin UI.
- Public reads exclude hidden content; extension resolve treats hidden entity as `not_found`.
- Block lazy/by-url rating on hidden canonical URLs.
- Minimal role model: `USER` | `ADMIN`.
- Stages 30–33 unchanged: Testing → E2E → Production Readiness → Stabilization.

### Reason

Matches product intent to ship MVP without a moderation platform. RFC-first approach mirrors RFC 0007 / Stage 28 success.

### Alternatives

- Original Stage 29 plan with `moderation_flags` and user reports.
- Full RBAC and moderation queue in MVP.
- Soft-delete without explicit visibility enum.

**Status:** Confirmed — implemented at Stage 29.

## 2026-06-27 - Stage 29 Content Hiding Implemented Per RFC 0008
