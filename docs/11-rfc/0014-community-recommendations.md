# RFC 0014: Community Recommendations

| Field | Value |
| ----- | ----- |
| Status | **Implemented** — Phases 1–4 complete (2026-07-10) |
| Scope | `/spotlight` UX, recommendation feed, future endorsement & review-supply loops |
| Depends on | RFC 0013 (Spotlight Credits, Contribution Layer), Ratings, Reviews |
| Amends | RFC 0013 §9 (Spotlight consumption UX) |
| Phase 1 | Virtual recommendation on placement, enriched feed API, page layout flip |
| Phase 2 | Recommendation endorsements |
| Phase 3 | «Сообществу нужны отзывы» production loop |
| Phase 4 | `Recommendation` as first-class DB entity |

---

## Summary

RFC 0013 introduced Spotlight Credits and `SpotlightPlacement` as earned distribution slots. The implementation conflates **promotion** (spending credits for visibility) with **recommendation** (a participant's opinion about something worth attention).

Users arrive at **«Рекомендации сообщества»** expecting community opinions. They see a spend-credits admin form first and thin cards that do not explain *why* an object appears.

This RFC separates the concepts:

> **Recommendation** = content (who recommends what, and why)  
> **Spotlight placement** = distribution (how long and where it appears in the feed)

Analogy: **Post ≠ Boost** (social network pattern).

**Core philosophy (unchanged from RFC 0013):**

> Visibility is earned. Opinion is free.

Credits buy **distribution**, not the right to have an opinion.

---

## Problem

| Today | Gap |
| ----- | --- |
| Page title: «Рекомендации сообщества» | First screen: «Потратить кредиты» forms (~95% of attention) |
| `SpotlightPlacement` = paid slot | UI says «Рекомендует {user}» but card has no quote, rating, or social proof |
| User mental model: Opinion → Recommendation → Feed | Actual flow: Credits → Placement → Object link |
| One sponsor per slot | No community agreement signal |
| `/contribute` has `entities_without_reviews` | Hidden among logos/duplicates; no dedicated review-supply loop |

---

## Non-Goals

- Pay-to-rank: more credits must **not** place items higher in the feed (INV-4 from RFC 0013)
- Downvotes / 👎 on recommendations (Phase 2+ may add one-sided «Поддержать» only)
- Mandatory new review to create a recommendation
- Proving real product usage before review
- Replacing organic discovery (Rising, Top, Best Week)
- Real-money purchase of visibility

---

## Non-Negotiable Invariants

All RFC 0013 invariants (INV-1 … INV-8) apply. Additional:

| ID | Invariant |
| -- | --------- |
| INV-R1 | **Endorsements never affect ratings or trust** — social proof on recommendations only |
| INV-R2 | **Feed order is not pay-weighted** — sort by `starts_at DESC` or fair rotation, never by `cost` |
| INV-R3 | **Credits affect duration/reach, not rank** — more credits = longer slot or more impressions, not top-of-feed auction |
| INV-R4 | **Recommendation copy uses «Рекомендовать», not «Продвинуть»** — product language matches philosophy |

---

## Conceptual Model

```text
Review (optional)
    ↓
Recommendation (content: author + target + excerpt)
    ↓
SpotlightPlacement (distribution: credits → slot duration)
    ↓
Community feed (/spotlight)
```

### Phase 1: Virtual recommendation

No schema migration. Each active `SpotlightPlacement` **is** a recommendation in API responses. Feed enriched with author review excerpt, entity rating, and slot metadata.

### Phase 4: First-class `Recommendation`

```sql
-- Future (not Phase 1)
CREATE TABLE community.recommendations (
  id          UUID PRIMARY KEY,
  author_id   UUID NOT NULL REFERENCES users.users(id),
  entity_id   UUID NULL,
  top_id      UUID NULL,
  pair_key    TEXT NULL,
  review_id   UUID NULL REFERENCES reviews.reviews(id),
  message     TEXT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- SpotlightPlacement gains recommendation_id FK
```

Enables: recommendation without credits (profile, entity page), multiple placements per recommendation, endorsements surviving slot expiry.

---

## Architecture

```text
┌─────────────────────────────────────────────────────────┐
│  /spotlight (consumption)                               │
│  Feed first → Recommend CTAs → Spend forms              │
│  Rich cards: author · quote · rating · time left        │
└───────────────────────────▲─────────────────────────────┘
                            │
┌───────────────────────────┴─────────────────────────────┐
│  SpotlightService.getFeed (enriched)                      │
│  placement + review excerpt + entity rating               │
└───────────────────────────▲─────────────────────────────┘
                            │
┌───────────────────────────┴─────────────────────────────┐
│  community.spotlight_placements (unchanged Phase 1)     │
└─────────────────────────────────────────────────────────┘
```

---

## Phase 1: Enriched Feed & UX Flip (now)

### API

`GET /spotlight?limit=30&locale=ru|en|all`

Extended `SpotlightPlacementDto`:

```ts
recommendation: {
  authorDisplayName: string;
  reviewExcerpt?: string;       // entity_spotlight only
  reviewId?: string;
  entityRating?: { avgScore: number; votesCount: number };
  creditsSpent: number;
  endsAt: string;
  supportedByCredits: true;
}
```

Top-level fields preserved for backward compatibility (home section, tracking).

Review resolution:
- `locale=ru|en` → author's review in that locale
- `locale=all` or omitted → fallback `ru`, then `en`

Review excerpt truncated to ~160 characters. Missing review is OK — card shows weaker state, creation is not blocked.

### Web `/spotlight`

Layout order:

1. Header — «Рекомендации сообщества»
2. **Feed** — «Рекомендуют участники», rich cards (primary)
3. **Recommend CTAs** — three buttons: object / top / battle
4. **Spend panel** — forms below, expanded on CTA click

Entity card shows: author, title, stars + score, quote, time remaining, «Поддержана кредитами сообщества».

Battle / top cards: author, title, time remaining (no rating/quote).

### i18n

Replace «Продвинуть / Подсветить» with «Рекомендовать» in spotlight spend copy.

---

## Phase 2: Endorsements

**Status: Implemented** — 2026-07-10

### Schema (future)

```sql
CREATE TABLE community.recommendation_endorsements (
  id            UUID PRIMARY KEY,
  placement_id  UUID NOT NULL REFERENCES community.spotlight_placements(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users.users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (placement_id, user_id)
);
```

### Rules

- One endorsement per user per placement
- User must have **rated or reviewed** the target entity to endorse entity recommendations
- No downvote in v1
- Endorsement count shown on card: «Поддержали N участников»
- Does not affect ratings, trust, or feed rank (INV-R1, INV-R2)

### API (future)

| Method | Path | Auth |
| ------ | ---- | ---- |
| POST | `/spotlight/placements/:id/endorse` | JWT |
| DELETE | `/spotlight/placements/:id/endorse` | JWT |

---

## Phase 3: «Сообществу нужны отзывы»

**Status: Implemented (MVP)** — 2026-07-10

Separate production loop on `/contribute` (or dedicated route).

Uses existing queue `entities_without_reviews` from [`contribute-queues.repository.ts`](../../apps/api/src/modules/community/repositories/contribute-queues.repository.ts).

Example card:

```text
Claude
Нужно ещё 3 отзыва для надёжной оценки
Награда: +2 contribution credits (future)
```

**Content supply** (generates reviews) vs **Spotlight** (redistributes attention). Long-term, review supply may be more valuable than another visibility sink.

---

## Phase 4: Recommendation Entity

**Status: Implemented** — 2026-07-10

Split `Recommendation` from `SpotlightPlacement`:

- Recommendation can exist without active placement
- Multiple placements can reference one recommendation (renewal)
- Endorsements attach to recommendation, survive placement expiry
- `RecommendationModule` ([`apps/api/src/modules/recommendation/`](../../apps/api/src/modules/recommendation/)) becomes the home module

Migration trigger: when any of organic recommendations, multi-placement, or endorsement persistence is required.

---

## Feed Ordering

Phase 1: `ORDER BY starts_at DESC` (newest first) — unchanged.

Future options (not pay-weighted):
- Fair rotation within active slots
- «Ending soon» as sort filter, not rank boost

**Never:** `ORDER BY cost DESC`.

---

## Rollout

| Phase | Deliverables |
| ----- | ------------ |
| **1** | RFC 0014, enriched feed API, page flip, rich cards, i18n | Done |
| **2** | Endorsements table + API + card UI | Done |
| **3** | Dedicated «needs reviews» section on `/contribute` | Done (MVP) |
| **4** | `recommendations` table, placement FK, endorsements on recommendation | Done |

---

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| Cards without review feel empty | Optional review; nudge to add; still show author + rating |
| «Supported by credits» feels advertorial | Small footnote; lead with author + quote |
| Endorsement farming | Require rating/review on target; rate limits |
| Pioneer (100 credits/mo) dominates feed | Duration caps, concurrent placement limits per user (RFC 0013 tuning) |

---

## Related

- [RFC 0013: Contribution & Attention Economy](./0013-contribution-attention-economy.md)
- [`apps/api/src/modules/community/services/spotlight.service.ts`](../../apps/api/src/modules/community/services/spotlight.service.ts)
- [`apps/web/src/features/spotlight/`](../../apps/web/src/features/spotlight/)
- [`apps/api/src/modules/recommendation/recommendation.module.ts`](../../apps/api/src/modules/recommendation/recommendation.module.ts) — `CommunityRecommendation` + endorsement repos
