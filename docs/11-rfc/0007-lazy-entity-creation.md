# RFC 0007: Lazy Entity Creation MVP

| Field      | Value                                              |
| ---------- | -------------------------------------------------- |
| Status     | **Confirmed** — 2026-06-27                         |
| Date       | 2026-06-27                                         |
| Scope      | Architecture only                                  |
| Applies to | Reviewo MVP                                        |
| Implements | Stage 28 (after Stages 25–27)                      |

## Summary

This RFC proposes **Lazy Entity Creation**: an entity is **not** created when a user opens a page or when resolve returns `not_found`. Instead, the entity is created only when an authenticated user performs the first meaningful write action — submitting a rating or a review — against a normalized canonical URL.

The goal is to remove the current multi-step UX:

```text
Open Site → Not Found → Open Reviewo → Create Entity → Return Back
```

and replace it with:

```text
Open Site → Not Found → User Rates or Reviews → Entity Created → Action Saved
```

This document defines the approved architecture. **Implementation is deferred to Stage 28** and must not begin before Stages 25–27 are complete.

---

## Context

### Current resolve flow

```text
URL
 ↓
Resolve (GET /extension/resolve or EntitiesPort.resolveEntityByUrl)
 ↓
Entity Found          or          Entity Not Found
                                        ↓
                              canCreateEntity: true
                                        ↓
                              Client shows "does not exist yet"
```

Today:

- URL normalization lives in `EntitiesModule` via `UrlNormalizationService`.
- Entity lookup uses exact match on normalized `canonical_url`.
- `POST /entities` requires JWT and explicit user input (`title`, `type`, optional `canonicalUrl`).
- Rating and review writes require an existing `entityId` and JWT.
- `canCreateEntity: true` is only a **client hint**; backend modules do not create entities during resolve or search.

### Why change

Manual entity creation through a separate form adds friction, especially in the browser extension where the user's intent is already expressed by rating or reviewing the current page.

---

## Goals

- Create entities only on first authenticated rating or review.
- Reuse existing URL normalization and canonical URL uniqueness rules.
- Preserve modular monolith boundaries.
- Avoid duplicate entities under concurrent first actions on the same URL.
- Keep resolve read-only.

## Non-Goals (this RFC)

- Automatic entity creation on page open or resolve.
- Site-specific URL parsers.
- Anonymous lazy creation.
- Replacing manual `POST /entities` (it may remain as an advanced path).
- Schema changes (unless a future implementation RFC proves otherwise).
- SEO/indexing product decisions beyond noting risks.

---

## 1. Domain Flow

### Options considered

| Option | Description | Assessment |
| ------ | ----------- | ---------- |
| **A. Ratings module owns creation** | `RatingsService.rateEntity` creates entity if missing before upserting rating. | **Reject.** Ratings must not own entity invariants (title, slug, type, canonical URL). Violates single-responsibility and duplicates logic for reviews. |
| **B. Reviews module owns creation** | Same as A, but in `ReviewsService`. | **Reject.** Same problems as A; two modules would duplicate provisioning rules. |
| **C. Entities module owns provisioning** | New Entities capability, e.g. `ensureEntityForUrl(...)`, encapsulates normalize → lookup → create-if-absent. | **Accept as owner.** Entity rules stay inside Entities domain. |
| **D. Application use case orchestrates domains** | Extension API exposes use cases such as `RateSiteUseCase`, which call `EntitiesPort` then `RatingsPort` / `ReviewsPort`. | **Accept as initiator.** Orchestration lives at application level; domains stay decoupled. |

### Confirmed architecture (non-negotiable)

Orchestration must **not** live inside Ratings or Reviews modules.

```text
Extension API
 ↓
RateSiteUseCase          (application layer)
 ↓
EntitiesPort.ensureEntityForUrl()
 ↓
RatingsPort.rateEntity()
```

Ratings must never call Entities for lazy provisioning. Reviews must never call Entities for lazy provisioning. Only application-level use cases coordinate cross-domain writes.

### Recommended flow

```text
Client (extension first; web later)
 ↓
Application use case (e.g. RateSiteUseCase in Extension API module)
 ↓
1. EntitiesPort.ensureEntityForUrl(url, provisioningInput, currentUser)
2. RatingsPort.rateEntity(entityId, ...)  OR  ReviewsPort.upsertMyReview(entityId, ...)
 ↓
Response includes entity summary + rating/review result
```

**Principles:**

1. **Entities domain owns lazy creation rules** — normalization, title/slug defaults, conflict handling, `EntityCreated` event.
2. **Ratings/Reviews domains stay unchanged in responsibility** — they still require a valid `entityId` and must not embed URL-to-entity logic.
3. **Application use cases orchestrate cross-domain writes** — e.g. `RateSiteUseCase` in Extension API; domains do not call each other for provisioning.
4. **Resolve stays read-only** — `GET /extension/resolve` and `resolveEntityByUrl` do not create entities.

### Provisioning input (conceptual)

Lazy creation needs minimal metadata not present in URL alone:

| Field | Source (MVP) | Required |
| ----- | ------------ | -------- |
| `url` | Client page URL or resolve payload | Yes |
| `sourceTitle` | `document.title` (extension/content) or user-editable fallback | Recommended |
| `type` | Default `website` for URL-backed lazy entities | Defaulted server-side |
| `description` | Omitted in MVP | No |

**Confirmed default type:** `website` — Reviewo primarily rates sites/services (e.g. `youtube.com`, `github.com`, `openai.com`), not individual pages. Other types (`company`, `product`, `movie`, etc.) can be added later through explicit creation or future parsers.

### Title handling (confirmed)

`sourceTitle` from `document.title` uses **minimal sanitization only**:

```text
trim
collapse internal whitespace to single spaces
max length 200 characters
```

Do **not** attempt semantic cleanup in MVP (no stripping of emojis, marketing suffixes, or site name patterns). Title quality is **best effort**; moderation and editing come later.

Server-side fallback when `sourceTitle` is missing or empty after sanitization: derive display title from normalized hostname (e.g. `example.com`).

---

## 2. Ownership

### Options considered

| Option | Pros | Cons |
| ------ | ---- | ---- |
| **`createdBy = triggering user`** | Matches existing ADR on accountable creation; clear attribution; works with nullable column today. | User "owns" pages they may not administratively control. |
| **`createdBy = null`** | Signals system/community object. | Breaks existing accountability ADR; harder moderation and audit. |
| **System account** | Central actor for automated records. | Requires seed user, special-case auth, and policy for "system-owned" entities. |
| **First contributor ≠ owner (separate field)** | Richer model. | Needs schema/product changes; out of MVP scope. |

### Recommendation

**Set `createdBy` to the authenticated user who triggers the first lazy creation** (first rating or first review).

Rationale:

- Aligns with existing decision: entity creation requires ownership via `created_by`.
- Lazy creation **is** creation, just deferred until first write.
- The first contributor is the most useful audit anchor in MVP.
- `createdBy` is already nullable in schema, but MVP should populate it for lazy-created entities.

**Note:** Ownership here means **creation attribution**, not legal/administrative control of the external site.

---

## 3. Concurrency

### Scenario

```text
100 authenticated users
 ↓
Same normalized URL
 ↓
First rating/review at nearly the same time
```

### Existing protections

- `entities.canonical_url` has a **unique index** (partial/conditional where not null).
- `EntitiesService.createEntity` already maps unique violations to `409 CONFLICT` with existing `entityId` in error details.

### Recommended algorithm (`ensureEntityForUrl`)

```text
1. canonicalUrl = UrlNormalizationService.normalize(url)
2. entity = findByCanonicalUrl(canonicalUrl)
3. if entity exists → return entity

4. try insert entity with canonicalUrl
5. if unique constraint violation:
     entity = findByCanonicalUrl(canonicalUrl)
     return entity   // another request won the race
6. publish EntityCreated event
7. return entity
```

### Additional MVP measures

| Measure | Purpose |
| ------- | ------- |
| **DB unique constraint on `canonical_url`** | Authoritative deduplication |
| **Idempotent read-after-conflict** | Turn race losers into success path |
| **Single canonical normalization path** | Prevent "different string, same page" duplicates outside normalizer rules |

### Deferred (post-MVP)

- Distributed locks / advisory locks per canonical URL.
- Queue-based serialisation for hot URLs.
- Pre-create reservation tokens.

### Cross-domain atomicity

**MVP recommendation:** run `ensureEntityForUrl` and the subsequent rating/review write as **sequential steps**, not one giant cross-schema transaction.

- If rating fails after entity creation, an entity without ratings may exist temporarily; user can retry rating.
- This matches current modular boundaries and is acceptable for MVP.
- A future enhancement can wrap both steps in an application-level saga if orphan entities become a problem.

---

## 4. URL Normalization

Lazy creation must use the **same** normalization pipeline as resolve and manual creation:

1. Client sends raw page URL (or canonical URL from prior resolve response).
2. Server always re-normalizes via `UrlNormalizationService` — never trust client-normalized URL alone.
3. Lookup and insert use the normalized `canonical_url`.
4. Tracking params, `www`, trailing slashes, and hash fragments follow existing MVP rules.

### Resolve + lazy write consistency

Preferred client pattern:

```text
Resolve → store canonical URL from response
Lazy write → send input URL or canonical URL; server re-normalizes
```

Even if the client sends canonical URL from resolve, **server-side normalization is mandatory** to prevent bypass of rules.

### Out of scope

- Site-specific parsers (YouTube, GitHub, etc.) — unchanged; deferred per existing ADR.

---

## 5. Idempotency

### Case: entity appears between resolve and write

```text
T0  Client resolve → not_found
T1  Another user creates entity (manual or lazy)
T2  Current user submits rating
```

**Expected behavior:** operation succeeds against the existing entity; no duplicate; user does not need a second resolve.

### Case: duplicate lazy write from same user

- Rating: existing upsert semantics (`entityId + userId` unique) — idempotent update.
- Review: existing upsert semantics — idempotent update.

### Case: retry after network failure

Client may retry the same lazy write request. Server should:

1. Re-run `ensureEntityForUrl` (returns existing entity if already created).
2. Re-run rating/review upsert (existing behavior).

### Recommended response flag (future API)

Include optional metadata in write responses:

```json
{
  "entityProvision": {
    "mode": "existing" | "created"
  }
}
```

Clients can use this for analytics/UX ("You were first"), but must not depend on it for correctness.

---

## 6. Anonymous Users

### Question

Can anonymous users trigger lazy entity creation?

### Recommendation

**No. Only authenticated users may trigger lazy creation in MVP.**

Rationale:

- All current write endpoints require JWT (`POST /entities`, rating, review, extension quick rating).
- Anonymous creation would increase spam and garbage entities.
- Extension and web already use minimal auth for writes.
- Resolve remains public and does not create entities.

### Anonymous user UX

- May see `not_found` card state.
- Sees CTA: sign in to be the first to rate/review.
- No entity is created until authentication + write.

---

## 7. Extension Flow

### Resolve states (unchanged read path)

| State | Card behavior (Stage 25+) |
| ----- | ------------------------- |
| `found` | Show rating aggregate, trust, user's rating if authenticated |
| `not_found` + `canCreateEntity: true` | Show **first-contributor** CTA |

### Recommended `not_found` UX

Primary copy:

> **Be the first to rate this site**

Secondary:

> No Reviewo page exists yet. Your rating will create it.

UI elements:

- Compact 1–5 rating control (enabled after Stages 26–27; lazy write in Stage 28).
- Optional "More on Reviewo" link to web (future create/review flow).
- Auth prompt if user is not signed in.
- Do **not** redirect user to a separate creation form for the default path.

### After successful lazy rating

```text
not_found card
 ↓ user selects rating (authenticated)
 ↓ lazy write API
 ↓
found card state (updated aggregate + trust)
```

Optional toast: "You created the first Reviewo page for this site."

### Reviews in extension

Defer review-based lazy creation in extension UI until a review surface exists in extension MVP. Architecture should still allow review-triggered lazy creation from web entity flows.

---

## 8. API Design (future — not for implementation in this RFC)

### Option A — Extend existing entity-scoped endpoints

`PUT /ratings/entities/:entityId/my-rating` accepts magic sentinel or optional body field `url` when entity does not exist.

| Pros | Cons |
| ---- | ---- |
| Fewer routes | Overloads entityId semantics; easy client confusion |
| | Hard to apply consistently across web + extension |

**Not recommended.**

---

### Option B — URL-scoped lazy write endpoints (extension-first)

New extension endpoints:

```http
PUT /extension/entities/by-url/my-rating
Authorization: Bearer <token>
Content-Type: application/json

{
  "url": "https://example.com/page?utm_source=x",
  "sourceTitle": "Example Page Title",
  "score": 4
}
```

Response (conceptual):

```json
{
  "entityProvision": { "mode": "created" },
  "entity": { "id": "...", "title": "...", "slug": "...", "type": "website" },
  "myRating": { "score": 4 },
  "rating": { "avgScore": 4, "votesCount": 1 },
  "trust": { "confidence": 0.1 },
  "url": { "input": "...", "canonical": "..." },
  "web": { "entityPagePath": "/entities/..." }
}
```

Review variant:

```http
PUT /extension/entities/by-url/my-review
```

| Pros | Cons |
| ---- | ---- |
| Clear contract for extension | Extension-specific unless mirrored on web |
| URL + score in one user action | New endpoints to maintain |

**Recommended for extension MVP.**

---

### Option C — Shared "lazy write" endpoints for web and extension

```http
PUT /entities/by-url/my-rating
PUT /entities/by-url/my-review
```

Extension API delegates internally or routes alias to the same application service.

| Pros | Cons |
| ---- | ---- |
| One contract for all clients | Slightly broader API surface |
| Matches REST resource thinking | Requires web adoption work |

**Recommended as the canonical backend shape; extension routes may alias during transition.**

---

### Option D — Two-step ensure + write

```http
POST /entities/ensure-by-url
PUT /ratings/entities/:entityId/my-rating
```

| Pros | Cons |
| ---- | ---- |
| Explicit separation | Two round trips; worse extension UX |
| | Client must handle races between steps |

**Not recommended for extension.**

---

### Resolve contract (unchanged)

`GET /extension/resolve?url=...` stays read-only. Optional future enhancement:

```json
{
  "status": "not_found",
  "canCreateEntity": true,
  "lazyCreate": {
    "supportedActions": ["rate", "review"],
    "requiresAuth": true
  }
}
```

This is optional metadata only; clients should not rely on resolve to perform creation.

---

## 9. Risks

| Risk | Description | Mitigation (MVP) |
| ---- | ----------- | ---------------- |
| **Spam entities** | Bots create pages for arbitrary URLs | Auth required; rate limits on lazy writes; future moderation flags |
| **Garbage metadata** | Titles like "404 Not Found" or empty `document.title` | Server title cleanup rules; hostname fallback; future edit/moderation |
| **Mass creation** | Automated URL lists create many entities | Auth + rate limiting; no creation on resolve; monitor creation velocity |
| **Duplicate entities** | Same page, different URLs outside normalizer | Strict normalizer; unique `canonical_url`; future `entity_links` |
| **SEO consequences** | Auto-created thin pages indexed by search engines | **Future decision.** Likely `noindex` for entities with very low activity; implementation deferred post-MVP |
| **Load spikes** | Viral URL triggers concurrent first writes | Unique constraint + read-after-conflict; DB handles dedup |
| **Wrong page attribution** | User rates URL A but page redirects to B | MVP accepts normalized input URL; redirect-aware canonicalization is post-MVP |
| **Orphan entities** | Entity created, write fails afterward | Retry-safe writes; acceptable MVP orphan rate |
| **Trust gaming** | Users create entities to manipulate trust | Trust MVP already conservative; moderation stage planned |

---

## 10. Recommended MVP Approach

### Decision summary

Reviewo should implement **Lazy Entity Creation** with the following MVP design:

1. **Trigger:** first authenticated **rating** or **review** against a URL — not page open, not resolve.
2. **Owner domain:** **Entities module** exposes `ensureEntityForUrl` (name TBD) via `EntitiesPort`.
3. **Orchestrator:** **Application use cases** (e.g. `RateSiteUseCase` in Extension API) call ensure → write. **Not** Ratings → Entities or Reviews → Entities.
4. **Ownership:** `createdBy = currentUser.id`.
5. **Default type:** `website` for lazy URL-backed entities.
6. **Title:** minimal sanitization (trim, collapse spaces, max 200); best effort; no semantic cleanup in MVP.
7. **Concurrency:** normalize → find → insert → on unique violation re-fetch; rely on existing `canonical_url` unique index.
8. **Normalization:** mandatory server-side `UrlNormalizationService.normalize`.
9. **Idempotency:** ensure step is safe to retry; rating/review upserts unchanged.
10. **Anonymous:** not allowed; sign-in required before lazy creation.
11. **Extension-first delivery:** implement full lazy flow in extension before reusing the same use case on web. **Do not change web in early lazy stages.**
12. **Extension UX:** `not_found` → **"Be the first to rate this site"** with inline rating (Stage 28); no redirect to manual creation form.
13. **Manual creation:** keep `POST /entities` and web create form as **fallback** (search → nothing found → create manually) for admins, moderators, imports, and catalog seeding. Normal users use lazy creation.
14. **API:** URL-scoped lazy write endpoints (`PUT /extension/entities/by-url/my-rating`, later review variant); extension is first consumer.
15. **SEO:** future decision; likely `noindex` for low-activity entities; implementation deferred.

### Roadmap placement (confirmed)

Lazy Entity Creation is **Stage 28**, after extension rating infrastructure is stable:

```text
Stage 25  Extension Rating Card MVP
    ↓
Stage 26  Extension Authentication
    ↓
Stage 27  Extension Submit Rating        (existing entities only)
    ↓
Stage 28  Lazy Entity Creation          (this RFC)
    ↓
Stage 29+ Moderation, testing, E2E, …
```

This order keeps resolve and the rating card working before entity provisioning changes are introduced.

### Implementation sequence

| Step | Stage | Work |
| ---- | ----- | ---- |
| 1 | 25 | Rating card UI for `found` resolve state |
| 2 | 26 | Extension auth (register/login, token storage) |
| 3 | 27 | Submit rating for **existing** entities via extension |
| 4 | 28 | `ensureEntityForUrl` + `RateSiteUseCase` + `PUT /extension/entities/by-url/my-rating` |
| 5 | Post-28 | Reuse `RateSiteUseCase` on web; review-based lazy creation when review UI exists |

Manual `POST /entities` remains as fallback; it is not the primary user path.

### Explicitly not changing in this RFC

- No migrations proposed.
- No resolve behavior change (still read-only).
- No Ratings/Reviews repository changes required for core dedup (entity layer handles creation).
- No site-specific parsers.

---

## Confirmed Decisions (2026-06-27)

| Topic | Decision |
| ----- | -------- |
| Default entity type | `website` |
| Title from `document.title` | trim, collapse spaces, max 200; no semantic cleanup |
| Web parity | Extension first; reuse application use case on web later |
| SEO | Future decision; likely `noindex` for low-activity entities; implementation deferred |
| Manual creation | Keep as fallback (`Search → Nothing found → Create manually`); lazy creation is the default user path |
| Orchestration | Application use case (`RateSiteUseCase`); never Ratings → Entities or Reviews → Entities |
| Implementation stage | Stage 28, after Stages 25–27 |

---

## References

- `apps/api/src/modules/entities/services/entities.service.ts` — resolve and create rules
- `apps/api/src/modules/entities/services/url-normalization.service.ts` — MVP normalizer
- `apps/api/src/modules/extension-api/services/extension-api.service.ts` — extension composition
- `project-management/04-decisions.md` — entity ownership, URL normalization, `canCreateEntity` hint ADRs
- `project-management/01-master-plan.md` — Stages 25–28 extension sequence

---

## Approval

| Role | Name | Date | Status |
| ---- | ---- | ---- | ------ |
| Product / PM | User | 2026-06-27 | **Confirmed** |
| Backend | | | Pending |
| Extension | | | Pending |

**Next step:** proceed with **Stage 25 — Extension Rating Card MVP**. Lazy Entity Creation implementation starts only at **Stage 28**.
