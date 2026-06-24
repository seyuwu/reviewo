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

- Description: `git status --short` fails because the current workspace has no `.git` repository.
- Status: Known environment/project setup limitation.
- Possible solution: Initialize git or open the actual repository root before creating commits.
- Priority: Low.
