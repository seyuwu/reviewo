# RFC 0013: Contribution & Attention Economy

| Field | Value |
| ----- | ----- |
| Status | **Proposed** — 2026-07-10 |
| Scope | Contribution Layer, activity logging, levels, `/contribute`, future attention economy |
| Depends on | Ratings, Reviews, Growth (battles), Tops (RFC 0010), Field Contributions (RFC 0011), Reputation (Trust), Discovery |
| Phase 1 | `activity_events`, contribution profile, Contribution Levels, `/contribute` |
| Phase 2 | Contribution Score, badges, Curator Rank, Expertise |
| Phase 3 | Spotlight Credits, `/spotlight`, Battle Boost, visibility economy |

> **Implementation scope:** This RFC describes the **full target architecture** (Phases 1–3). **Current implementation is limited to Phase 1 only.** Phases 2–3 are forward-looking design; schemas and event types are laid out now so they can be computed retroactively from `activity_events`.

---

## Summary

Opinia today is **entity-centric**: ratings, reviews, battles, and tops orbit around objects. This RFC introduces a **people-centric Contribution Layer** — an economy of attention (not money) that rewards useful participation without corrupting ratings or trust.

**Core philosophy:**

> Opinia rewards contribution to public opinion, not the purchase of attention.

> Visibility is earned. Opinion is free.

Opinia becomes **Consumption + Production**: users do not only read opinions; they create lists, fix data, discover objects, and shape collective judgment. ExtensionBooster-style credit marketplaces are explicitly rejected; reciprocity is **attention barter**, never **rating barter**.

---

## Problem

| Today | Gap |
| ----- | --- |
| Users rate and review, but no unified notion of platform contribution | No progress signal beyond field-editor stats (RFC 0011) |
| Empty entity pages → churn | No guided production loop (“where does the base need help?”) |
| Trust exists (`UserTrustProfile`) but is separate from participation | Risk of conflating “trustworthy rater” with “active contributor” |
| Discovery is meritocratic (rising, top, battles) | No future path for **earned** editorial visibility without polluting organic rankings |
| Makers lack a reason to participate before launching | Chicken-and-egg: why rate others if nobody sees your project? |

---

## Non-Goals (all phases)

- Pay-to-win: **no real-money purchase of visibility or credits**
- Incentivized store reviews (Chrome Web Store, Google Play)
- Review pin, sponsored review, or any spend that affects review ordering
- Contribution Score or credits affecting `avg_score`, `votes_count`, `/top`, Rising, Best Week, or `UserTrustProfile`
- Replacing RFC 0011 Field Contributions module (merge, field fix proposals)
- Expertise or Spotlight in Phase 1

---

## Non-Negotiable Invariants

These define product DNA. Formulas may change; invariants must not.

| ID | Invariant |
| -- | --------- |
| INV-1 | **Contribution never affects ratings** — aggregates, avg score, entity confidence from contribution activity |
| INV-2 | **Contribution never affects trust** — `UserTrustProfile`, vote weight, anomaly penalties |
| INV-3 | **Credits never buy ratings or reviews** — no pin, no sponsored review, no paid placement in review lists |
| INV-4 | **Spotlight never affects Top / Rising / Best Week / reliability** — only labeled editorial discovery slots |
| INV-5 | **Trust and Contribution are independent** — separate tables, modules, formulas; no cross-write |
| INV-6 | **Recognition > raw activity** (Phase 2+) — primary points from community signals (helpful, fork, save), not bare clicks |
| INV-7 | **No pay-to-win** — visibility may be earned through contribution; visibility may **never** be purchased with money |
| INV-8 | **Visibility is earned. Opinion is free.** — credits buy impressions, not actions |

### Layer separation

```text
Contribution Layer  = helps the platform grow (activity, levels, future credits)
Trust Layer         = how much to trust a person's opinion (reputation engine)
Rating Layer        = what the person thinks (ratings, reviews, organic tops)
```

```text
Contribution  ≠  Trust  ≠  Rating
```

---

## Personas

| Persona | Role | Value from Contribution Layer |
| ------- | ---- | ------------------------------ |
| **Consumer** | Reads opinions | `/contribute` as a guide to interesting gaps; discovery |
| **Contributor** | Rates, reviews, votes in battles | Level badge, contribution stats on profile |
| **Curator** | Creates and maintains tops | Top stats; future Curator Rank (Phase 2) |
| **Expert** | Deep opinions in a category | Future Expertise score (Phase 2); editorial “expert opinion” blocks |
| **Maker** | Represents own products | Future earned Spotlight / Battle Boost (Phase 3) — never paid placement |

One Contribution Layer serves all personas; rewards differ by role.

---

## Architecture

```text
                    ┌─────────────────────────────────────┐
                    │           Rating Layer              │
                    │  ratings · reviews · organic tops   │
                    └──────────────────▲──────────────────┘
                                       │ weights opinions
                    ┌──────────────────┴──────────────────┐
                    │            Trust Layer              │
                    │  UserTrustProfile · anomaly · HHI   │
                    └─────────────────────────────────────┘
                                       ✕ no write
                    ┌──────────────────┴──────────────────┐
                    │        Contribution Layer           │
                    │  activity_events → level → credits│
                    └──────────────────▲──────────────────┘
                                       │ future: editorial slots only
                    ┌──────────────────┴──────────────────┐
                    │     Discovery (editorial subset)    │
                    │  /spotlight · battle boost (Ph. 3)  │
                    └─────────────────────────────────────┘
```

### Naming (avoid collisions)

| RFC term | Code / schema | Do not confuse with |
| -------- | ------------- | ------------------- |
| Contribution Layer | `community` schema, `CommunityModule` | — |
| Field contributions | `contributions.*` (RFC 0011) | entity metadata proposals |
| Trust | `reputation.*`, `UserTrustProfile` | Contribution Level |
| Reputation events | `reputation.reputation_events` | `community.activity_events` |

**Do not extend `ContributionsModule` (RFC 0011)** for activity logging. Use a new `CommunityModule`.

---

## 1. Vision

- **Consumption:** browse ratings, reviews, tops, battles, compare pages.
- **Production:** rate, review, curate tops, fix data, merge duplicates, discuss, discover new entities.
- **Economy of attention (Phase 3):** contributors earn finite Spotlight Credits from **tier**, spend on labeled discovery slots — never on opinion manipulation.

Most rating sites are read-only for 95% of users. Opinia treats production as a first-class citizen.

---

## 2. Activity Events

Append-only log in **`community.activity_events`**. Separate from `reputation.reputation_events` (Trust engine).

### Schema

```sql
CREATE SCHEMA IF NOT EXISTS community;

CREATE TABLE community.activity_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users.users(id) ON DELETE CASCADE,
  action_type     TEXT NOT NULL,
  entity_id       UUID NULL,
  entity_type     TEXT NULL,
  category_id     UUID NULL,
  target_user_id  UUID NULL,
  payload         JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX activity_events_dedupe_idx
  ON community.activity_events (user_id, action_type, (payload->>'sourceId'))
  WHERE payload ? 'sourceId';

CREATE INDEX activity_events_user_created_idx
  ON community.activity_events (user_id, created_at DESC);
CREATE INDEX activity_events_type_created_idx
  ON community.activity_events (action_type, created_at DESC);
CREATE INDEX activity_events_entity_created_idx
  ON community.activity_events (entity_id, created_at DESC);
```

`payload.sourceId` — idempotency key (rating id, review id, battle vote id, etc.).

`entity_type` and `category_id` are written from day 1 for retroactive Expertise (Phase 2).

### Phase 1 action types

| action_type | Trigger | Domain event |
| ----------- | ------- | ------------ |
| `rating.created` | New rating | `rating.created` (exists) |
| `review.created` | New review | `review.created` (exists) |
| `entity.created` | Lazy or manual entity create | `entity.created` (exists) |
| `battle.vote` | Battle vote cast/updated | `battle.vote` (new) |
| `top.created` | User top created | `top.created` (new) |
| `top.updated` | User top metadata/items updated | `top.updated` (new) |
| `contribution.approved` | RFC 0011 contribution applied | `contribution.approved` (new) |
| `discussion.created` | Entity chat message | `discussion.created` (new) |

### Phase 2+ reserved types (document only)

`review.helpful`, `top.forked`, `top.saved`, `top.liked`, `entity.first_ratings`, `entity.first_reviews`

### Handler pattern

`ActivityEventHandlers` subscribes to `DomainEventBus` (same pattern as `ReputationEventHandlers`). On event: insert `activity_events`, recompute `user_contribution_snapshots`.

### Backfill

One-time job from existing tables: `ratings.ratings`, `reviews.reviews`, `growth.battle_votes`, `tops.tops`, `contributions.entity_contributions` (APPLIED), `chat.entity_chat_messages`, `entities.entities` (created_by). Use historical ids as `sourceId` to avoid duplicates when live handlers run.

---

## 3. Contribution Layer Overview

**Module:** `apps/api/src/modules/community/`

| Component | Responsibility |
| --------- | -------------- |
| `ActivityEventsRepository` | Append-only insert, dedupe |
| `ContributionSnapshotRepository` | Cached counts + level |
| `ContributionLevelCalculator` | Tier from counts + decay |
| `ActivityEventHandlers` | Domain event → activity log |
| `ContributeQueuesService` | `/contribute` queue queries |
| `CommunityController` | HTTP API |

---

## 4. Contribution Levels (Phase 1)

**UI shows rank name only — no numeric Contribution Score in Phase 1.**

| Level | Label |
| ----- | ----- |
| 0 | Newcomer |
| 1 | Contributor |
| 2 | Active Contributor |
| 3 | Curator |
| 4 | Pioneer |

### Phase 1 thresholds (tunable constants)

Evaluated on `user_contribution_snapshots` counts (highest matching tier wins):

| Level | Rule (any condition) |
| ----- | -------------------- |
| Contributor | `ratings_count >= 10` OR `reviews_count >= 3` |
| Active Contributor | `ratings_count >= 50` OR `reviews_count >= 10` OR `tops_count >= 1` |
| Curator | `tops_count >= 3` OR (`tops_count >= 1` AND `field_fixes_count >= 5`) |
| Pioneer | `entities_created_count >= 5` OR `field_fixes_count >= 20` |

### Decay

If `last_activity_at` older than **90 days**, display level drops by one tier (minimum Newcomer). Counts are preserved; only displayed level changes.

---

## 5. Contribution Score (Phase 2 — design only)

Not implemented in Phase 1. Stored internally later; **never shown as a number in UI** — only tier.

### Base points (small)

| Action | Points |
| ------ | ------ |
| Rating | +1 |
| Battle vote | +1 |
| Review | +3 |
| Top created | +5 |
| Discussion | +2 |
| Entity created | +5 |
| Merge approved | +10 |

### Recognition points (large)

| Signal | Points |
| ------ | ------ |
| Review marked helpful | +15 |
| Reply to review | +5 |
| Top liked | +10 |
| Top saved | +20 |
| Top forked | +50 |
| Entity reached 10 ratings | +20 |
| Entity reached 10 reviews | +50 |
| Field fix approved | +20 |
| Merge approved | +50 |

### Diminishing returns (Phase 2)

Per action type per UTC day:

- First N actions: 100% points
- Next band: 50%
- Beyond: 10%

---

## 6. Expertise (Phase 2 — design only)

Derived per `entity_type` / `category_id` from `activity_events`:

```text
AI: 1200
Games: 300
Universities: 50
```

- Does **not** affect entity rating or trust weight
- Powers editorial blocks (“Expert opinions in AI”)
- Requires `entity_type` + `category_id` on events from Phase 1

---

## 7. Curator Rank (Phase 2 — design only)

Emergent per category — **not a separate currency**:

```text
CuratorRank(category) = f(tops_created, forks_received, saves, likes, engagement)
```

Uses existing `tops.top_likes`, `tops.top_views` (RFC 0010 Phase 3 engagement).

---

## 8. Spotlight Credits (Phase 3 — design only)

- **Tier → monthly grant** (not infinite accumulation)
- Unused credits partially expire at month end
- **Never purchasable with money** (INV-7)

Example grant schedule (tunable):

| Tier | Credits / month |
| ---- | --------------- |
| Contributor | 5 |
| Active Contributor | 20 |
| Curator | 50 |
| Pioneer | 100 |

### Spend sinks

| Sink | Cost | Notes |
| ---- | ---- | ----- |
| Spotlight slot (24–72h) | 10 | Labeled “Recommended by @user” |
| Battle boost (7d) | 15 | Promote comparison pair |
| Top highlight (7d) | 20 | Featured user top |

**Explicitly excluded:** review pin, rating boost, organic top/rising placement.

---

## 9. Spotlight & Battle Boost (Phase 3 — design only)

> **UX detail:** Recommendation vs placement separation, enriched feed cards, endorsements, and review-supply loops are specified in [RFC 0014: Community Recommendations](./0014-community-recommendations.md).

### `/spotlight` (consumption)

Labeled vitrine: “Participants recommend”. CTA: Open, Compare, Discuss — **not** “Rate this”.

### Battle Boost

Promote a **pair** (e.g. Claude vs GPT), not a single entity. Less advertorial, more discussion.

### Organic protection

[`discovery.repository.ts`](../../apps/api/src/modules/discovery/repositories/discovery.repository.ts) queries for Rising, Top, Best Week remain untouched. Spotlight items appear only in dedicated labeled blocks.

---

## 10. `/contribute` (Phase 1)

**Purpose:** production loop without points — show where the database needs help.

### Queues (MVP)

| Queue key | Description | Query basis |
| --------- | ----------- | ----------- |
| `entities_without_reviews` | Active entities with zero reviews | `entities` LEFT JOIN review count |
| `entities_without_logo` | Missing `logoUrl` | `logoUrl IS NULL` |
| `possible_duplicates` | Entities with duplicate suggestions | RFC 0011 heuristic aggregate |
| `tops_without_description` | User tops missing description | `description` null/empty |
| `low_activity_battles` | Battle pairs with few votes | `growth.battle_votes` GROUP BY pair |

### API

`GET /contribute/queues?limit=20` — public (view without auth; acting requires auth on target pages).

### Web

Route: `/contribute`. Secondary nav link in app chrome.

---

## 11. Anti-Farming

### Phase 1

- Idempotent `sourceId` on all events
- Counts derived from event log, not client claims

### Phase 2+

- No points for rating own entities (`createdBy` check)
- Diminishing returns on ratings/battles per day
- No bonus for engaging with spotlighted items
- Trust floor for spending credits (Phase 3)
- Cross-reference `UserCoordinationCluster` (reputation) — do not merge with Contribution tables

---

## 12. Profile UX (Phase 1)

Extend profile page with **Contribution Profile** section:

```text
Вклад
Оценок: 132
Отзывов: 18
Битв: 592
Топов: 4
Добавлено объектов: 11
Исправлений: 9

Уровень: Active Contributor
```

Separate from existing **Editor stats** (RFC 0011 field contributions).

### API

| Method | Path | Auth |
| ------ | ---- | ---- |
| GET | `/users/me/contribution` | JWT |
| GET | `/contribute/queues` | Public |

Public `GET /users/:id/contribution` — Phase 2.

---

## 13. Data Model (Phase 1)

### `community.user_contribution_snapshots`

```sql
CREATE TABLE community.user_contribution_snapshots (
  user_id                 UUID PRIMARY KEY REFERENCES users.users(id) ON DELETE CASCADE,
  level                   TEXT NOT NULL DEFAULT 'newcomer',
  ratings_count           INT NOT NULL DEFAULT 0,
  reviews_count           INT NOT NULL DEFAULT 0,
  battle_votes_count      INT NOT NULL DEFAULT 0,
  tops_count              INT NOT NULL DEFAULT 0,
  entities_created_count  INT NOT NULL DEFAULT 0,
  field_fixes_count       INT NOT NULL DEFAULT 0,
  discussions_count       INT NOT NULL DEFAULT 0,
  last_activity_at        TIMESTAMPTZ NULL,
  calculated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`level` enum values: `newcomer`, `contributor`, `active_contributor`, `curator`, `pioneer`.

---

## 14. Migration Plan

1. Prisma migration: `community` schema + tables
2. `CommunityModule` registered in `AppModule`
3. New domain events: `battle.vote`, `top.created`, `top.updated`, `contribution.approved`, `discussion.created`
4. `ActivityEventHandlers` + snapshot recompute
5. Backfill script from historical data
6. API: `/users/me/contribution`, `/contribute/queues`
7. Web: `/contribute`, profile contribution section
8. i18n: `web.contribute.*`, `web.profile.contribution*`

**Do not modify:** `reputation.*` formulas, discovery organic SQL, ratings aggregates.

---

## 15. Rollout Phases

| Phase | Deliverables | Gate |
| ----- | ------------ | ---- |
| **1 (now)** | `activity_events`, snapshots, backfill, profile counts + levels, `/contribute` | RFC approved |
| **2** | Contribution Score, badges, Curator Rank, Expertise, public profiles | Sufficient DAU + event history |
| **3** | Credits, `/spotlight`, Battle Boost, visibility economy | Audience threshold (~1k+ MAU) |

---

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| Naming collision Contributions vs Contribution Level | `community` schema + `CommunityModule` |
| Double-count on backfill + live | `sourceId` unique index |
| Empty `/contribute` on small DB | Honest empty states; page still useful as CTA |
| Level inflation | High initial thresholds; tune from event analytics |
| Internal SEO (Phase 3) | Finite credits, labeled slots, organic separation |
| Pay-to-win temptation | INV-7 in RFC + product policy |

---

## Related

- [RFC 0010: User Tops & System Tops](./0010-user-tops-and-system-tops.md)
- [RFC 0011: Community Contributions](./0011-community-contributions.md) — field edits (orthogonal)
- [product/web-discovery-and-battles.md](../product/web-discovery-and-battles.md)
- `apps/api/src/modules/reputation/` — Trust Layer
- `apps/api/src/common/domain-events/` — event bus

---

## Appendix: Phase 1 event flow

```text
Service publishes domain event
        ↓
ActivityEventHandlers
        ↓
INSERT community.activity_events (idempotent)
        ↓
Recompute user_contribution_snapshots
        ↓
Profile / future analytics read snapshot
```

Estimated effort: 2–3 evenings for Phase 1.
