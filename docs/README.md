# Reviewo Documentation

This directory is the long-term home for project documentation. Content is being migrated from root-level markdown files (see `project-management/02-backlog.md`).

## Index

| Path | Description |
| ---- | ----------- |
| [product/web-discovery-and-battles.md](./product/web-discovery-and-battles.md) | Главная лента, битвы, discovery API, лимиты на странице, поведение активных/случайных битв |
| [development-workflow.md](./development-workflow.md) | Локальная разработка → GitHub → production (Opinia в Chrome Web Store и на VPS) |
| [deployment/mvp-deploy.md](./deployment/mvp-deploy.md) | MVP production deployment notes (Stage 32) |
| [deployment/selectel-vds-guide.md](./deployment/selectel-vds-guide.md) | Пошаговый деплой на VDS Selectel (рядом с другим Docker-проектом) |
| [testing/mvp-e2e-flow.md](./testing/mvp-e2e-flow.md) | MVP end-to-end user journey (Stage 31) |
| [testing/mvp-smoke-checklist.md](./testing/mvp-smoke-checklist.md) | MVP manual smoke checklist and integration test notes |
| [11-rfc/0009-hierarchical-entities.md](./11-rfc/0009-hierarchical-entities.md) | RFC 0009: Hierarchical entities & extension display modes (Phase 1) |
| [11-rfc/UX-0001-extension-experience-foundation.md](./11-rfc/UX-0001-extension-experience-foundation.md) | RFC UX-0001: Extension experience foundation |
| [11-rfc/0007-lazy-entity-creation.md](./11-rfc/0007-lazy-entity-creation.md) | RFC: Lazy Entity Creation MVP (**confirmed**, Stage 28) |
| [11-rfc/0008-content-hiding-moderation-mvp.md](./11-rfc/0008-content-hiding-moderation-mvp.md) | RFC: Content Hiding — Moderation MVP Foundation (**confirmed**, Stage 29) |
| [11-rfc/0010-user-tops-and-system-tops.md](./11-rfc/0010-user-tops-and-system-tops.md) | RFC 0010: User Tops & System Tops — Top as first-class object |
| [11-rfc/0013-contribution-attention-economy.md](./11-rfc/0013-contribution-attention-economy.md) | RFC 0013: Contribution & Attention Economy — activity events, levels, `/contribute`, future spotlight economy |
| [11-rfc/0014-community-recommendations.md](./11-rfc/0014-community-recommendations.md) | RFC 0014: Community Recommendations — recommendation vs placement, enriched `/spotlight` feed, endorsements |

## RFCs

Request for Comments documents propose architectural changes before implementation.

| RFC | Title | Status |
| --- | ----- | ------ |
| [0007](./11-rfc/0007-lazy-entity-creation.md) | Lazy Entity Creation MVP | **Confirmed** (implements at Stage 28) |
| [0008](./11-rfc/0008-content-hiding-moderation-mvp.md) | Content Hiding — Moderation MVP Foundation | **Confirmed** (implements at Stage 29) |
| [0009](./11-rfc/0009-hierarchical-entities.md) | Hierarchical Entities & Extension Display Modes | **Proposed** (Phase 1 in progress) |
| [0010](./11-rfc/0010-user-tops-and-system-tops.md) | User Tops & System Tops | **Proposed** (post-validation) |
| [0011](./11-rfc/0011-community-contributions.md) | Community Contributions (field edits) | **Confirmed** |
| [0012](./11-rfc/0012-entity-presence-clusters.md) | Entity Presence Clusters | **Implemented** |
| [0013](./11-rfc/0013-contribution-attention-economy.md) | Contribution & Attention Economy | **Proposed** (Phase 1: activity events, levels, `/contribute`) |
| [0014](./11-rfc/0014-community-recommendations.md) | Community Recommendations | **Proposed** (Phase 1: enriched feed, UX flip) |

Planned RFC slots (from `Структура.md`): rating system, trust system, extension UI, mobile app, AI summary, recommendation, extension parser, extension cache, extension API, extension settings, extension sync.

## Related

- [project-management/](../project-management/) — active development state, ADRs, changelog, roadmap execution
