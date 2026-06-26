# Known Issues

## Documentation Is Not Yet In `docs/`

- Description: Project documentation currently lives in root-level markdown files instead of the intended `docs/` structure.
- Status: Accepted temporary state.
- Possible solution: Move and rename documentation into `docs/` in a dedicated documentation stage.
- Priority: Medium.

## Dedicated API Contract Document Is Missing

- Description: There is no standalone `04-api.md` yet, even though API is the contract between backend, web, and extension.
- Status: Known limitation.
- Possible solution: Create and approve API contract documentation before implementing endpoints that require detailed response/request shapes.
- Priority: High.

## Extension Documentation Has Formatting Problems

- Description: `extention.md` has an incorrect filename and broken markdown near the end.
- Status: Known limitation.
- Possible solution: Rename and clean up the document when documentation is moved into `docs/`.
- Priority: Low.

## Entity Relations Are Deferred

- Description: MVP does not implement `entity_relations`, so the first entity hierarchy is limited to `parent_id`.
- Status: Intentional MVP limitation.
- Possible solution: Add `entity_relations` later through RFC without changing existing entity APIs.
- Priority: Medium.

## Trust Score Is Simplified

- Description: MVP trust score uses a simple replaceable calculation instead of a full trust-signal system.
- Status: Intentional MVP limitation.
- Possible solution: Add trust signals and advanced anti-fraud logic after MVP validation.
- Priority: Medium.

## Site-Specific Extension Parsers Are Deferred

- Description: MVP extension does not include specialized parsers for YouTube, GitHub, Amazon, or other sites.
- Status: Intentional MVP limitation.
- Possible solution: Add parsers later through RFC once the generic URL-based flow is validated.
- Priority: Medium.

## `pnpm` Is Not Installed Globally

- Description: The local shell does not recognize `pnpm` directly.
- Status: Workaround available.
- Possible solution: Use `corepack pnpm ...`; `package.json` pins `pnpm@11.9.0`.
- Priority: Low.

## Workspace Is Not A Git Repository

- Description: Earlier `git status --short` failed because the workspace did not expose a `.git` repository.
- Status: Resolved in the current workspace.
- Possible solution: No action needed while working from the current repository root.
- Priority: Low.

## `make` Is Not Installed In Current Environment

- Description: The project has a `Makefile`, but the current Windows shell does not recognize `make`.
- Status: Known environment limitation.
- Possible solution: Install `make`, use Docker Compose commands directly, or add an additional cross-platform task runner later if needed.
- Priority: Low.

## Web And Extension Docker Services Use Placeholder Commands

- Description: `web` and `extension` containers currently run `pnpm check` and stay alive because real applications are not implemented yet.
- Status: Intentional Stage 3 limitation.
- Possible solution: Replace placeholder commands with real app start commands during the relevant app implementation stages.
- Priority: Medium.

## Docker Development Uses Dev Volumes

- Description: Development Compose uses bind-mounted source files and Docker-managed dependency volumes. First startup or lockfile changes still run `pnpm install` inside the API container to populate/sync volumes.
- Status: Resolved for backend development loop; still a known dev environment behavior.
- Possible solution: Use `make clean` or `docker compose ... down -v` if dependency volumes become stale. Run `make build` when Dockerfiles or base images change.
- Priority: Low.

## Localhost Database Checks Can Hit A Non-Compose PostgreSQL

- Description: On Windows, Prisma CLI checks against `localhost:5432` can fail if another local PostgreSQL listener is present or if port forwarding resolves differently than expected.
- Status: Known environment caveat.
- Possible solution: Prefer running migration smoke checks inside the Docker Compose network using host `postgres`, or ensure local `DATABASE_URL` points to the intended database.
- Priority: Low.

## Parallel Prisma Generate Can Lock Files On Windows

- Description: Running multiple workspace commands that invoke `prisma generate` in parallel can fail with `EBUSY` when the generated Prisma Client files are copied.
- Status: Known environment caveat.
- Possible solution: Run `corepack pnpm typecheck` and `corepack pnpm build` sequentially when Prisma schema changed, or avoid parallel commands that both generate Prisma Client.
- Priority: Low.
