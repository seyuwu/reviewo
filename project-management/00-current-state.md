# Current State

## Snapshot

- Date: 2026-06-27
- Current stage: Waiting for user confirmation before Stage 25
- Stage status: Stage 24 completed
- MVP readiness: 24%
- Last completed stage: Stage 24 - Extension URL Detection
- Next stage: Stage 25 - Extension Rating Card MVP

## Implemented Capabilities

The first product capabilities are implemented: users can register, sign in, read the current authenticated user, create entities with normalized canonical URLs, fetch entities by id, fetch composed entity page data, search entities through the dedicated Search Module, resolve URLs for the browser extension, quick-rate entities through the Extension API, rate entities, update their previous rating, read rating aggregates, read their own rating, leave or update one text review per entity, like/unlike useful reviews, list entity reviews, and read MVP trust confidence for an entity through the backend API. The web app now starts as a Next.js application with routing, layout, providers, TanStack Query, a base API client, home search UX backed by the Search API, minimal authenticated entity creation, a base entity page with rating/review interactions, and a read-only profile page. The browser extension now has a Chrome MV3 skeleton with background, content, and popup entry points plus a local build output. The extension reads the current page URL, resolves it through the backend Extension API, and passes the result toward future card UI.

The project currently contains temporary root-level markdown documentation. The documentation is accepted as the source of truth until it is moved into `docs/`.

The monorepo foundation is initialized:

- Root workspace metadata exists in `package.json`.
- Workspace boundaries are configured in `pnpm-workspace.yaml`.
- Application directories exist under `apps/api`, `apps/web`, and `apps/extension`.
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
- No trust, search, extension, moderation, or recommendation tables have been added. Stage 13 intentionally does not persist trust scores; Stage 15 intentionally does not add search tables; Stage 17 intentionally does not add extension tables.

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
- `EntitiesPort` exists as the public module interface for entity lookup, URL resolution, and search.

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
- Ratings Module exposes rating aggregate reads and rating writes through `RatingsPort`.
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

The Extension API MVP foundation is initialized:

- `GET /extension/resolve?url=...` resolves a browser tab URL into extension card data.
- Found URL resolution returns entity summary, rating aggregate, trust confidence, canonical URL data, and web entity page path.
- Missing URL resolution returns `not_found`, canonical URL data, and `canCreateEntity`.
- `PUT /extension/entities/:entityId/my-rating` quick-rates an entity and requires JWT authentication.
- Quick rating returns updated aggregate, current user's rating, refreshed trust confidence, entity summary, and web entity page path.
- Extension API uses `EntitiesPort`, `RatingsPort`, and `TrustPort`.
- Extension API does not import or use domain repositories.
- Browser extension UI, Chrome APIs, content scripts, site-specific parsers, entity auto-creation, new auth model, and new database tables are intentionally not implemented.

The Frontend Skeleton is initialized:

- `@reviewo/web` exists as a Next.js App Router application.
- Root layout and global styles exist.
- TanStack Query is configured through a top-level providers component.
- A base API client exists under `apps/web/src/lib/api`.
- Frontend uses `NEXT_PUBLIC_API_BASE_URL` with a local fallback.
- Components do not call `fetch` directly.
- Docker development web service runs the Next.js dev server on `WEB_PORT`.
- Full auth UI, extension UI, frontend business logic, and shared API DTO exports are intentionally not implemented yet.

The Web Home And Search MVP is initialized:

- Home page contains the "Что хотите оценить?" search input.
- Search runs live through TanStack Query.
- Search requests go through feature API code and the base API client.
- Search results are rendered as result cards.
- Missing entity responses show a create-page hint that links to the creation flow.
- Frontend search code is scoped under `apps/web/src/features/home-search`.
- Browser access from web to API is supported through `CORS_ALLOWED_ORIGINS`.
- Full auth UI, ratings UI outside entity pages, extension UI, and frontend search business logic are intentionally not implemented.

The Web Entity Creation MVP is initialized:

- `/entities/new` contains a short entity creation form.
- The creation form uses the shared minimal web auth panel.
- Creation uses backend `POST /entities` with a JWT access token.
- Created entities redirect to the base web entity page.
- Home search missing-result hint links to `/entities/new?query=...`.
- Backend still validates submitted entity data and normalizes canonical URLs.
- Full auth UI, ratings UI outside entity pages, reviews UI outside entity pages, and extension UI are intentionally not implemented.

The Web Entity Page MVP is initialized:

- `/entities/:id` renders a base entity page.
- Entity page primary data comes from backend `GET /entities/:entityId/page`.
- Entity page shows entity header, average rating, vote count, trust confidence, review count, rating distribution, and top reviews.
- Entity page includes a rating form using `PUT /ratings/entities/:entityId/my-rating`.
- Entity page includes a review form using `PUT /reviews/entities/:entityId/my-review`.
- Entity page reads current user rating/review when a minimal web auth session exists.
- Entity page refreshes composed data through TanStack Query invalidation after rating/review updates.
- Minimal web auth is shared between entity creation and entity page interactions.
- Review pagination, review likes UI, recommendations, moderation, profile UI, full auth UI, and extension UI are intentionally not implemented.

The Web Profile MVP is initialized:

- `/profile` renders a minimal read-only profile page.
- Profile data is loaded from backend `GET /auth/me`.
- The profile page uses the shared minimal web auth panel for sign in/out.
- Profile displays current user id, display name, email, username, and status.
- No backend profile endpoints or database tables were added.
- Profile editing, recent ratings/reviews, user activity endpoints, account settings, recommendations, moderation, full auth UI, and extension product UI are intentionally not implemented.

The Browser Extension Skeleton is initialized:

- `@reviewo/extension` exists as a Chrome Manifest V3 extension package.
- Extension structure includes `background`, `content`, and `popup` entry points.
- Shared message contracts live under `apps/extension/src/shared`.
- Content and popup scripts can ping the background worker and receive pong responses.
- Extension build outputs loadable artifacts under `apps/extension/dist`.
- Docker development extension service runs the extension watch build.

Extension URL Detection is initialized:

- Content script reads the current page URL on supported HTTP/HTTPS pages.
- Background worker calls backend `GET /extension/resolve?url=...`.
- Resolve results are cached per tab in the background worker.
- Content script publishes `reviewo:resolve-result` for future card UI integration.
- Popup can read the active tab resolve result through background messaging.
- Manifest includes `tabs` permission and localhost API host permissions.
- Rating card UI, auth, quick rating UI, and site-specific parsers are intentionally not implemented.

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

The web container now runs the Next.js dev server in development. The extension container now runs the extension watch build in development.

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

Stage 17 created the backend Extension API MVP only. It did not add browser extension UI, Chrome APIs, content scripts, site-specific parsers, entity auto-creation, new auth model, or new database tables.

Stage 18 created the frontend skeleton only. It did not add product search UI, entity pages, auth UI, extension UI, frontend business logic, or shared API DTO exports.

Stage 19 created the web home/search UX only. It did not add entity creation flow, entity detail pages, auth UI, ratings UI, extension UI, or frontend search business logic.

Stage 20 created the web entity creation flow only. It did not add full auth UI, full entity page UI, ratings UI, reviews UI, or extension UI.

Stage 21 created the base web entity page only. It did not add review pagination, review likes UI, recommendations, moderation, profile UI, full auth UI, or extension UI.

Stage 22 created the read-only web profile only. It did not add profile editing, recent activity endpoints, account settings, recommendations, moderation, full auth UI, or extension UI.

Stage 23 created the browser extension skeleton only. It did not add URL detection, backend API calls, rating card UI, auth, or site-specific parsers.

Stage 24 created extension URL detection only. It did not add rating card UI, auth, quick rating UI, or site-specific parsers.
