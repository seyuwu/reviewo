# MVP Master Plan

Status legend:

- ⬜ Not started
- 🟨 In progress
- ✅ Completed

## Approved Development Plan

### 1. ✅ Monorepo Initialization

Goal: create the base project structure.

Result:

- Create `apps/` and `packages/`.
- Prepare locations for `api`, `web`, and `extension`.
- Add base package scripts.
- Keep the project installable without business logic.

Verification:

- Dependencies can be installed.
- Basic project command can run.

### 2. ✅ TypeScript And Tooling Setup

Goal: establish a strict TypeScript baseline.

Result:

- Enable TypeScript Strict Mode.
- Add shared `tsconfig` setup.
- Configure ESLint and Prettier.
- Add basic import rules.
- Prepare shared configs in `packages/`.

Verification:

- `typecheck` passes.
- `lint` passes.
- No cyclic dependencies in the initial structure.

### 3. ✅ Docker Infrastructure

Goal: prepare one-command development and production startup through Docker Compose.

Result:

- Add `docker-compose.yml` as the base Compose definition.
- Add `docker-compose.dev.yml` for local development.
- Add `docker-compose.prod.yml` for production deployment.
- Add Dockerfiles for each application.
- Add `.env.example`.
- Add `.dockerignore`.
- Add `Makefile` or `Taskfile.yml` with core development commands.
- Keep the structure ready for one-command production updates in the future.

Verification:

- Development stack can be started with one command.
- Production stack has a separate compose override.
- Docker files do not break monorepo boundaries.
- Production update path does not require changing project structure.

### 4. ✅ Shared Packages

Goal: prepare shared packages without business logic.

Result:

- `packages/types` for shared API types.
- `packages/shared` for technical utilities.
- `packages/config` for shared configuration.
- `packages/ui` as a design-system placeholder.

Verification:

- Packages can be imported by apps.
- Shared packages contain no business logic.

### 5. ✅ Backend Skeleton

Goal: create the NestJS API as a modular monolith.

Result:

- Create `apps/api`.
- Configure application bootstrap.
- Add health endpoint.
- Create base `modules/` structure.
- Add `common` for errors, configuration, and technical cross-cutting concerns.

Verification:

- API starts.
- Health endpoint responds.
- Backend passes lint and typecheck.

### 6. ⬜ Database Infrastructure

Goal: prepare PostgreSQL infrastructure for MVP.

Result:

- Configure PostgreSQL connection.
- Select and connect migration tooling.
- Add environment configuration.
- Prepare domain schemas: `auth`, `users`, `entities`, `ratings`, `reviews`, `trust`, `moderation`.

Verification:

- Migrations apply to an empty database.
- Application starts with the database connection.

Required confirmation before implementation:

- ORM and migration tooling choice.

### 7. ⬜ Backend Error And Response Foundation

Goal: define one API error and response foundation.

Result:

- Centralized error handling.
- Base domain errors.
- Validation error format.
- Unified HTTP status approach.
- Preparation for future API contract documentation.

Verification:

- Errors are returned in one format.
- Controllers do not manually build error responses.

### 8. ⬜ Users/Auth MVP Foundation

Goal: create the minimum user model needed for ratings.

Result:

- `users` module.
- `auth` module.
- `users` and `user_auth_identities` tables.
- MVP registration and authorization.
- Current user endpoint.

Verification:

- User can register and sign in.
- Protected endpoints require authorization.
- Auth business logic does not leak into other modules.

Required confirmation before implementation:

- MVP auth approach.

### 9. ⬜ Entities Module

Goal: implement the central entity domain.

Result:

- `entities` module.
- `entities`, `entity_links`, and `entity_images` tables.
- Support `parent_id`, `canonical_url`, and `entity_links`.
- Manual entity creation.
- Find entity by normalized URL.
- Public `EntitiesPort` for other modules.

Verification:

- Entity can be created.
- Entity can be found by canonical or normalized URL.
- Other modules do not access entity repositories directly.

### 10. ⬜ URL Normalization MVP

Goal: implement minimal URL canonicalization.

Result:

- Backend URL normalization service.
- Remove basic tracking parameters.
- Normalize protocol, domain, and `www`.
- Store canonical URL.
- Keep the algorithm replaceable.

Verification:

- Equivalent URLs with tracking parameters point to one entity.
- The normalization algorithm is isolated and replaceable.

### 11. ⬜ Ratings Module

Goal: implement user ratings.

Result:

- `ratings` module.
- `ratings` and `rating_aggregates` tables.
- Create or update a user rating.
- Recalculate aggregates.
- Public `RatingsPort`.

Verification:

- One user has one active rating per entity.
- Average score and votes count update.
- Entity module does not contain rating logic.

### 12. ⬜ Reviews Module

Goal: implement basic reviews.

Result:

- `reviews` module.
- `reviews` and `review_votes` tables.
- Create review.
- List reviews for an entity.
- Upvote or downvote review.
- Public `ReviewsPort`.

Verification:

- User can leave a review.
- Entity reviews can be fetched.
- Review votes work independently from ratings.

### 13. ⬜ Trust Module MVP

Goal: implement a simple replaceable trust score.

Result:

- `trust` module.
- `trust_scores` table.
- Calculation based on rating count, review count, entity age, and user activity.
- Algorithm extracted into a strategy/service.
- API returns trust without exposing internal algorithm details.

Verification:

- Trust recalculates after important events.
- Algorithm can be replaced without API contract changes.

### 14. ⬜ Backend Domain Events MVP

Goal: prepare low coupling between modules.

Result:

- Simple in-process event mechanism.
- Events: `EntityCreated`, `RatingCreated`, `RatingUpdated`, `ReviewCreated`.
- Trust and aggregates react to events where appropriate.
- No direct access to foreign repositories.

Verification:

- Events work inside the monolith.
- Future event bus migration does not require domain rewrites.

### 15. ⬜ Search Module MVP

Goal: implement entity search through PostgreSQL.

Result:

- `search` module.
- Search by title and canonical URL.
- Basic indexes.
- Endpoint for the home page.
- Fallback flow for creating a new page.

Verification:

- User can find an entity.
- Search does not contain entity creation business logic.

### 16. ⬜ Entity Page API Composition

Goal: provide one backend endpoint for the entity page.

Result:

- Endpoint returns entity, rating aggregate, trust, and reviews.
- Frontend does not know which modules were involved.
- Response DTO is located in the public API layer.

Verification:

- Web can fetch entity page data with one request.
- Internal module boundaries are not exposed.

Required confirmation before implementation:

- Exact response DTO.

### 17. ⬜ Extension API MVP

Goal: provide the minimum API required by the browser extension.

Result:

- Endpoint to resolve an object by URL.
- If found, return rating, trust, and entity summary.
- If not found, return a state that allows creation flow.
- Endpoint for quick rating.
- Link data for opening the web entity page.

Verification:

- Extension can send URL and receive card data.
- Extension does not contain object type detection business logic.

Required confirmation before implementation:

- Extension API contract.

### 18. ⬜ Frontend Skeleton

Goal: create the Next.js web app.

Result:

- Create `apps/web`.
- Configure routing, layout, and providers.
- Connect design-system foundation.
- Configure TanStack Query and base API client.
- Keep `fetch` out of components.

Verification:

- Web app starts.
- Basic page opens.
- Lint and typecheck pass.

### 19. ⬜ Web Home And Search

Goal: implement the main search UX.

Result:

- Home page with "Что хотите оценить?" search input.
- Live search.
- Results list.
- "Create new page" action when entity is not found.

Verification:

- User can search for an entity.
- UI does not contain search business logic.

### 20. ⬜ Web Entity Creation MVP

Goal: implement manual entity creation.

Result:

- Short creation form.
- Fields: title, type/category, optional link.
- Redirect to entity page after creation.

Verification:

- User can create an entity in a minimal number of steps.
- Backend validates all submitted data.

### 21. ⬜ Web Entity Page MVP

Goal: implement the base entity page.

Result:

- Entity header.
- Rating card.
- Trust block.
- Reviews list.
- Rating form.
- Review form.
- Basic statistics.

Verification:

- User can open an entity, rate it, and leave a review.
- Page uses the composition endpoint.

### 22. ⬜ Web Profile MVP

Goal: implement a minimal user profile.

Result:

- Profile page.
- Basic user information.
- Recent ratings or reviews if included in MVP scope.

Verification:

- User sees their data.
- Profile does not mix rating or review business logic.

### 23. ⬜ Browser Extension Skeleton

Goal: create the minimum extension structure.

Result:

- `background`, `content`, and `popup` structure.
- Chrome manifest.
- Extension build.
- Basic content/background messaging.

Verification:

- Extension can be loaded locally.
- Background and content scripts exchange messages.

### 24. ⬜ Extension URL Detection

Goal: detect the current URL and send it to the backend.

Result:

- Content script reads URL.
- Background sends API request.
- Result is passed to the card UI.

Verification:

- Opening a page produces an API request.
- No site-specific parsers exist.

### 25. ⬜ Extension Rating Card MVP

Goal: show the compact rating card.

Result:

- Rating is displayed.
- Trust score is displayed.
- "More details" action exists.
- Card does not disturb the page.

Verification:

- Card appears for a found entity.
- "More details" opens the web entity page.

### 26. ⬜ Extension Quick Rating

Goal: allow rating from the extension.

Result:

- User selects a rating in the card.
- Extension sends the rating to backend.
- Card updates rating and trust data.

Verification:

- Rating is saved.
- Aggregates update.
- Extension does not calculate rating itself.

### 27. ⬜ Moderation MVP Foundation

Goal: create the minimum moderation foundation.

Result:

- `moderation_flags` table.
- Endpoint for reporting an entity or review.
- Basic report status.
- No complex admin UI in this stage.

Verification:

- Moderation flag can be created.
- Moderation stays isolated in its module.

### 28. ⬜ Testing Baseline

Goal: cover critical MVP scenarios.

Result:

- Backend unit tests for URL normalization, ratings, and trust.
- Integration tests for key endpoints.
- Frontend smoke tests for main pages.
- Extension smoke or manual checklist.

Verification:

- Tests run with one command.
- Critical MVP flow is covered.

### 29. ⬜ MVP End-To-End Flow

Goal: verify the main user journey.

Result:

- User registers.
- User searches for an object.
- User creates an object if missing.
- User rates the object.
- User sees updated rating.
- Extension detects URL and allows rating.

Verification:

- End-to-end flow passes.
- "Rate an object in under 5 seconds" can be checked manually.

### 30. ⬜ Production Readiness MVP

Goal: prepare the project for first deployment.

Result:

- Environment validation.
- Build scripts.
- Basic logging.
- Database migration command.
- Seed or development data.
- Deployment notes.

Verification:

- Backend, web, and extension build.
- Project can be deployed using documented instructions.

### 31. ⬜ MVP Stabilization

Goal: remove architectural and UX problems before growth.

Result:

- Review module boundaries.
- Check absence of cyclic dependencies.
- Review API contracts.
- List post-MVP RFCs: site-specific parsers, entity relations, advanced trust, OpenSearch, recommendations.

Verification:

- MVP is stable.
- Known limitations are explicit.
- Next roadmap can be planned without rewriting the core.
