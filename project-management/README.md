# Project Management

This folder exists to restore project context in future chats and keep MVP development aligned with the architecture documentation.

## Required Startup Workflow

Before starting any development work:

1. Read all project documentation from `docs/`.
2. If `docs/` does not exist yet, read the current markdown documentation files in the project root. They are the temporary source of truth until documentation is moved.
3. Read every file in `project-management/`.
4. Compare the requested work with the documentation and current project state.
5. Only then start planning or implementation.

## Documentation Priority

Project documentation is the primary source of requirements.

If documentation and code diverge:

1. Stop.
2. Explain the mismatch.
3. Propose possible resolutions.
4. Wait for user confirmation before changing architecture or behavior.

## Development Rules

- Work strictly by the approved MVP master plan.
- Do not move to the next stage without user confirmation.
- Keep `project-management/` updated after every completed stage.
- Keep backend business logic on the backend.
- Preserve modular monolith boundaries.
- Prefer clean, scalable architecture over faster but weaker implementation.

## Files In This Folder

- `00-current-state.md` - current MVP state and blockers.
- `01-master-plan.md` - approved MVP plan and stage statuses.
- `02-backlog.md` - future work outside the current stage.
- `03-in-progress.md` - active stage details.
- `04-decisions.md` - architecture decision log.
- `05-known-issues.md` - known limitations and problems.
- `06-changelog.md` - development history by completed stage.
- `07-next-session.md` - short handoff for the next chat.
