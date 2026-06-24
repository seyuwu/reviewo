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
