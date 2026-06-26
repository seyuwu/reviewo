# Current State

## Snapshot

- Date: 2026-06-27
- Current stage: Waiting for user confirmation before Stage 17
- Stage status: Stage 16 completed
- MVP readiness: 16%
- Last completed stage: Stage 16 - Entity Page API Composition
- Next stage: Stage 17 - Extension API MVP

## Implemented Capabilities

The first product capabilities are implemented: users can register, sign in, read the current authenticated user, create entities with normalized canonical URLs, fetch entities by id, fetch composed entity page data, search entities through the dedicated Search Module, rate entities, update their previous rating, read rating aggregates, read their own rating, leave or update one text review per entity, like/unlike useful reviews, list entity reviews, and read MVP trust confidence for an entity through the backend API.

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
- Development Compose uses bind-mounted source files with Docker-managed `node_modules` and pnpm store volumes.
- `make dev` no longer forces a rebuild on every startup.
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
- No moderation, recommendation, Swagger, frontend, or extension product behavior has been added.

The database infrastructure is initialized:

- Prisma is configured as the ORM and migration tooling.
- Prisma 7 configuration lives in `apps/api/prisma.config.ts`.
- Prisma schema exists with Users/Auth, Entity, Ratings, and Reviews MVP models.
- Initial migration creates PostgreSQL schemas only.
- `DatabaseModule` exposes a single infrastructure Prisma provider through DI.
- `PrismaService` owns database connection lifecycle and shutdown.
- Seed script structure exists without seed data.
- Health endpoint includes a database connectivity check.
- No trust, search, moderation, recommendation, or extension tables have been added. Stage 13 intentionally does not persist trust scores; Stage 15 intentionally does not add search tables.

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
- `entity_relations`, graph relations, many-to-many entity links, aliases, tags, categories, versions, moderation, merge, AI, import, and recommendations are intentionally not implemented.
- `POST /entities` creates an entity and requires JWT authentication.
- `GET /entities/:id` returns an entity by id.
- `GET /entities/search` performs simple PostgreSQL-backed search.
- `EntitiesPort` exists as the public module interface for entity lookup and search.

The URL Normalization MVP is initialized:

- URL normalization is isolated behind a replaceable normalizer interface.
- Canonical URLs are normalized during entity creation.
- URL-aware entity search normalizes URL queries before lookup.
- Equivalent URLs with tracking parameters resolve to one `canonical_url`.
- The normalizer removes basic tracking parameters.
- The normalizer lowercases hostnames, removes a leading `www`, removes hash fragments, removes non-root trailing slashes, canonicalizes to `https`, and sorts preserved query parameters.
- Site-specific normalizers are intentionally not implemented yet.

The Ratings MVP foundation is initialized:

- `ratings.ratings` stores one active rating per user per entity.
- `ratings.rating_aggregates` stores aggregate rating data per entity.
- Rating scale is integer `1..5`.
- Re-rating updates the previous user rating.
- Aggregates include `avgScore`, `votesCount`, and distribution for scores `1..5`.
- `PUT /ratings/entities/:entityId/my-rating` creates or updates the current user's rating.
- `GET /ratings/entities/:entityId` returns the rating aggregate.
- `GET /ratings/entities/:entityId/my-rating` returns the current user's rating or `null`.
- Ratings Module checks entity existence through `EntitiesPort`.
- Entity Module does not store or calculate ratings.

The Reviews MVP foundation is initialized:

- `reviews.reviews` stores one text review per author per entity.
- `reviews.review_votes` stores one like per user per review.
- `PUT /reviews/entities/:entityId/my-review` creates or updates the current user's review.
- `GET /reviews/entities/:entityId` returns entity reviews sorted by likes count.
- `GET /reviews/entities/:entityId/my-review` returns the current user's review or `null`.
- `POST /reviews/:reviewId/like` likes a review idempotently.
- `DELETE /reviews/:reviewId/like` removes a review like idempotently.
- Reviews Module checks entity existence through `EntitiesPort`.
- Reviews Module does not read or modify Ratings data.

The Trust MVP foundation is initialized:

- `GET /trust/entities/:entityId` returns `{ "confidence": number }`.
- `confidence` is a decimal number from `0` to `1`, rounded to two decimals.
- MVP trust confidence uses only rating count and review count.
- Rating count contributes up to `0.9` confidence at 100 ratings.
- Review count contributes up to `0.1` confidence at 20 reviews.
- Trust Module reads rating count through `RatingsPort`.
- Trust Module reads review count through `ReviewsPort`.
- Trust Module does not own users, ratings, reviews, or entity data.
- Trust Module does not persist `trust_scores` in Stage 13.
- User reputation, account age, anti-fraud, text analysis, IP, ML, external services, and behavioral signals are intentionally excluded.

The backend domain events foundation is initialized:

- `DomainEventBus` provides a minimal in-process publish/subscribe mechanism.
- Domain events are plain data contracts with `name`, `occurredAt`, and `payload`.
- `EntityCreated`, `RatingCreated`, `RatingUpdated`, `ReviewCreated`, and `ReviewUpdated` event contracts exist.
- Entity creation publishes `EntityCreated` after successful persistence.
- Rating create/update publishes `RatingCreated` or `RatingUpdated` after the rating transaction commits.
- Review create/update publishes `ReviewCreated` or `ReviewUpdated` after successful persistence.
- No external broker, queue, outbox table, retry mechanism, or event versioning has been added.
- Rating aggregates remain transaction-local in Ratings Module.
- Trust confidence remains on-demand in Trust Module.

The Search MVP foundation is initialized:

- `GET /search/entities?query=...` provides the home-page entity search endpoint.
- Search results are backed by the Entity Module PostgreSQL search.
- Search supports title/slug/canonical URL matching through `EntitiesPort`.
- URL-aware search reuses Entity Module URL normalization behavior.
- Search response includes `results` and `canCreateEntity`.
- `canCreateEntity` is only a fallback hint for clients; Search Module does not create entities.
- Search Module does not import or use `EntitiesRepository`.
- OpenSearch is intentionally not implemented.

The Entity Page API Composition foundation is initialized:

- `GET /entities/:entityId/page` returns composed entity page data.
- Response contains `entity`, `rating`, `trust`, `reviews`, and `meta`.
- `reviews` contains top 10 reviews only.
- `meta.reviewsCount` contains the total number of reviews.
- Composition uses `EntitiesPort`, `RatingsPort`, `ReviewsPort`, and `TrustPort`.
- Entity page composition does not import or use domain repositories.
- No frontend or extension behavior has been added.

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

Stage 10 created URL normalization only. It did not add `entity_links`, aliases, site-specific parsers, extension behavior, OpenSearch, ratings, reviews, trust, or recommendations.

Stage 11 created ratings only. It did not add reviews, trust calculation, recommendations, moderation, frontend, extension flow, or rating logic inside Entity Module.

Stage 12 created reviews and review likes only. It did not add dislikes, replies, threaded comments, reactions, attachments, images, AI analysis, moderation, complaints, edit history, review ratings, trust calculation, frontend, or extension flow.

Stage 13 created MVP trust confidence only. It did not add trust persistence, user reputation, account age, anti-fraud, text analysis, IP checks, ML, external services, behavioral signals, badges, user trust, review trust, moderation, frontend, or extension flow.

Stage 14 created backend domain events infrastructure and publish points only. It did not add external brokers, queues, outbox persistence, retries, event versioning, asynchronous handlers, or move aggregate/trust behavior into event handlers.

Stage 15 created the Search Module MVP only. It did not add OpenSearch, frontend search UI, extension search flow, indexing workers, entity creation business logic inside Search Module, or entity page API composition.

Stage 16 created entity page API composition only. It did not add frontend UI, extension behavior, review pagination endpoint, new domain logic, or direct repository access from the composition layer.
