# RFC 0008: Content Hiding — Moderation MVP Foundation

| Field      | Value                                              |
| ---------- | -------------------------------------------------- |
| Status     | **Confirmed** — 2026-06-27                         |
| Date       | 2026-06-27                                         |
| Scope      | Architecture only                                  |
| Applies to | Reviewo MVP                                        |
| Implements | Stage 29 (after Stage 28)                          |

## Summary

This RFC defines **Moderation MVP Foundation** as a **content-hiding mechanism**, not a moderation platform.

MVP scope is exactly two capabilities:

1. An **admin** can hide a junk **entity** (e.g. `casino-spam-123.com`).
2. An **admin** can hide a junk **review** (e.g. `"BUY CRYPTO NOW"`).

There are **no** reports, appeals, queues, workflows, audit logs, admin UI, or trust/moderation integrations in this stage.

**Implementation is deferred until this RFC is confirmed.** No Stage 29 code should start before approval.

---

## Context

### MVP core already shipped (Stage 28)

```text
Resolve
 ↓
Login
 ↓
Rate Existing Site
 ↓
Rate Unknown Site
 ↓
Auto Create Entity
```

Lazy creation (RFC 0007) increases the need for a cheap way to remove spam entities and reviews without building a full moderation system.

### Current data model

- `entities.entities` — no visibility/status field today.
- `reviews.reviews` — no visibility/status field today.
- `users.users.status` exists (`active`, etc.) but **no roles or admin flag**.
- `ModerationModule` exists as an empty NestJS shell.
- All public read paths assume every stored entity/review is visible.

### Why narrow the scope

The word **Moderation** easily expands into many stages:

```text
reports → appeals → queues → roles → permissions → audit logs → admin panel → workflows
```

For MVP we need **garbage removal**, not governance infrastructure.

---

## Goals

- Hide junk entities from public discovery and public read APIs.
- Hide junk reviews from public lists and entity pages.
- Keep domain boundaries intact (Entities owns entity visibility; Reviews owns review visibility).
- Require minimal admin authorization (no permissions matrix).
- Preserve the Stage 28 extension flow for **non-hidden** content.

## Non-Goals (this RFC)

- User-submitted reports / flagging.
- Moderation queues, assignments, SLA, or reviewer workflows.
- Statuses such as `PENDING`, `REJECTED`, `UNDER_REVIEW`, `APPEAL`.
- Admin web UI or extension UI for moderation.
- Audit log tables or moderation history UI.
- Automatic spam detection, ML, or trust-based auto-hide.
- Hiding ratings independently (only entity + review in MVP).
- SEO / `noindex` policy implementation (noted as future).
- User reputation, bans, or account suspension.

---

## RFC Questions & Recommendations

### 1. Does Entity need a separate status?

**Yes.**

Add `EntityVisibility` (or `EntityStatus`) on `entities.entities`:

```text
ACTIVE   — default; visible in public read paths
HIDDEN   — excluded from public read paths; row remains in DB
```

| Option | Assessment |
| ------ | ---------- |
| **A. `ACTIVE` / `HIDDEN` enum on Entity** | **Accept.** Minimal, matches MVP intent. |
| B. Soft-delete (`deleted_at`) | Reject for MVP naming — "hidden" is product language; soft-delete implies different UX. |
| C. Separate `moderation_flags` table only | Reject — adds join complexity without MVP benefit. |
| D. Full workflow statuses | Reject — out of scope. |

**Default:** new and manually created entities are `ACTIVE`.

---

### 2. Does Review need a separate status?

**Yes.**

Add `ReviewVisibility` on `reviews.reviews`:

```text
ACTIVE   — default; included in public review lists
HIDDEN   — excluded from public review lists; row remains in DB
```

Same rationale as Entity. Reviews and entities are hidden **independently** (hide spam review on an otherwise good entity).

Ratings are **not** hidden in MVP — only entity and review text surfaces.

---

### 3. What happens when content is hidden?

#### Hidden entity — public behavior

| Surface | Behavior |
| ------- | -------- |
| `GET /search/entities` | Excluded (as if it does not exist) |
| `GET /extension/resolve?url=...` | Returns `not_found` (same as unknown URL) |
| `GET /entities/:id` | `404 NOT_FOUND` |
| `GET /entities/:entityId/page` | `404 NOT_FOUND` |
| `GET /trust/entities/:entityId` | `404 NOT_FOUND` |
| `GET /ratings/entities/:entityId` | `404 NOT_FOUND` (entity treated as unavailable) |
| `GET /reviews/entities/:entityId` | `404 NOT_FOUND` |
| Extension rating card | Not shown (`not_found` resolve path) |
| Lazy create / by-url rating on same canonical URL | **Blocked** — see § Extension & lazy create |

Hidden entities **remain in the database** with canonical URL, ratings, and reviews. Hiding is **reversible** via admin unhide (API-only in Stage 29; no UI required).

#### Hidden review — public behavior

| Surface | Behavior |
| ------- | -------- |
| `GET /reviews/entities/:entityId` | Hidden reviews omitted from list |
| Entity page top reviews | Hidden reviews omitted; `meta.reviewsCount` counts **ACTIVE** reviews only |
| Review like endpoints | `404` for hidden review id on public mutation paths |

Entity itself stays visible if only the review is hidden.

#### Rating aggregates & trust

- Hidden entity: public aggregates/trust are unavailable (entity is `404` publicly).
- Hidden review: trust recalculation uses **ACTIVE** review count only (existing on-demand trust formula).

No aggregate recalculation job is required for MVP hide — hidden entity is already unreachable publicly.

---

### 4. Does the author see hidden content?

**Recommended MVP policy:**

| Actor | Hidden entity | Hidden review |
| ----- | ------------- | ------------- |
| **Public / other users** | `404` / `not_found` | Omitted from lists |
| **Author of review** | N/A | **Yes** — `GET /reviews/entities/:entityId/my-review` returns their review with `visibility: HIDDEN` |
| **Entity `createdBy` user** | **No special public read** — same as other users (`404`) | N/A |
| **Admin** | Can read via future admin read endpoints **or** direct hide/unhide API responses | Same |

Rationale:

- Review authors should understand why their text disappeared and avoid duplicate resubmits.
- Entity creators do not get a special "my hidden entity" path in MVP — keeps scope small.
- No author-facing explanation UI in Stage 29.

**Alternative (stricter):** author also gets `404` on `my-review`. Simpler API, worse UX. **Not recommended.**

---

### 5. What does the API return?

#### Hide actions (admin-only)

```http
POST /moderation/entities/:entityId/hide
Authorization: Bearer <admin token>
```

Response `200`:

```json
{
  "entityId": "...",
  "visibility": "HIDDEN",
  "hiddenAt": "2026-06-27T12:00:00.000Z"
}
```

```http
POST /moderation/reviews/:reviewId/hide
Authorization: Bearer <admin token>
```

Response `200`:

```json
{
  "reviewId": "...",
  "visibility": "HIDDEN",
  "hiddenAt": "2026-06-27T12:00:00.000Z"
}
```

Optional symmetric unhide (recommended for ops, still no UI):

```http
POST /moderation/entities/:entityId/unhide
POST /moderation/reviews/:reviewId/unhide
```

Idempotent hide/unhide (already hidden → success, no error).

#### Public read changes

- No new public endpoints.
- Existing responses unchanged in shape except:
  - Hidden entities disappear (`404` / `not_found`).
  - Review lists omit hidden items.
  - `my-review` may include `visibility` field when author reads own review.

#### Errors

| Case | Code |
| ---- | ---- |
| Non-admin calls hide | `403 FORBIDDEN` |
| Hide unknown id | `404 NOT_FOUND` |
| Public read hidden entity | `404 NOT_FOUND` (do not leak "hidden" vs "missing" on public entity reads) |

---

### 6. How does hiding affect extension resolve?

**Public resolve treats `HIDDEN` entities as `not_found`.**

```text
GET /extension/resolve?url=https://casino-spam-123.com/
 ↓
status: not_found
canCreateEntity: true   // unchanged hint shape
 ↓
Extension card: "Be the first to rate this site" (not_found UX)
```

**Important interaction with lazy creation (Stage 28):**

If a hidden entity still occupies `canonical_url`:

| Step | Behavior |
| ---- | -------- |
| User rates via `PUT /extension/entities/by-url/my-rating` | **Reject** with `404` / generic "This site is not available on Reviewo" |
| `ensureEntityForUrl` | Must **not** revive hidden spam by attaching new ratings |
| Admin unhide | After unhide, resolve returns `found` again; lazy/existing rating flows work |

Algorithm sketch for `ensureEntityForUrl` after this RFC:

```text
1. resolveEntityByUrl (ACTIVE-only lookup for public-facing paths)
2. ensureEntityForUrl internal lookup:
   - if ACTIVE entity exists → reuse
   - if HIDDEN entity exists at canonical URL → throw NOT_AVAILABLE (do not rate)
   - else → create ACTIVE entity (existing lazy create path)
```

This prevents hidden casino domains from accumulating new ratings through the extension.

---

### 7. What minimal roles are needed?

**One admin role is enough for MVP.**

| Option | Assessment |
| ------ | ---------- |
| **A. `users.role` enum: `USER` \| `ADMIN`** | **Accept.** Simple guard; seed one admin in dev. |
| B. `users.is_admin boolean` | Acceptable equivalent. |
| C. Permissions matrix / RBAC | Reject for MVP. |
| D. Hard-coded admin email list in env | Accept as bootstrap only; pair with A for clarity. |

**`AdminGuard`** (or `RolesGuard('ADMIN')`) protects `/moderation/*` hide/unhide routes only.

Regular users:

- Cannot hide content.
- Cannot report content in Stage 29 (reports deferred).

Registration creates `USER` by default. Admin promotion is **out of band** for MVP (seed script, migration, or manual DB update) — no admin UI.

---

## Architecture

### Domain ownership

```text
Moderation API (admin endpoints)
 ↓
HideEntityUseCase / HideReviewUseCase   (application layer in Moderation module)
 ↓
EntitiesPort.hideEntity(id)             ReviewsPort.hideReview(id)
 ↓
EntitiesService                         ReviewsService
```

**Rules:**

- Moderation module **does not** own entity/review tables.
- Moderation module **does not** access entity/review repositories directly.
- Entities module owns entity visibility transitions and ACTIVE-only public queries.
- Reviews module owns review visibility transitions and ACTIVE-only public list queries.
- Search, Extension API, Entity Page composition consume existing ports — they automatically respect ACTIVE-only reads once ports enforce visibility.

### Port additions (conceptual)

```ts
// EntitiesPort
hideEntity(entityId: string): Promise<EntityDto>;
unhideEntity(entityId: string): Promise<EntityDto>;
// resolveEntityByUrl / getEntityById / searchEntities → ACTIVE only for public callers

// ReviewsPort
hideReview(reviewId: string): Promise<ReviewDto>;
unhideReview(reviewId: string): Promise<ReviewDto>;
// listReviewsForEntity → ACTIVE only; getMyReview → returns HIDDEN to author
```

### What we are NOT building

```text
moderation_flags
moderation_reports
moderation_queue
moderation_actions audit table
admin panel
workflow engine
```

---

## Schema changes (Stage 29 — after RFC approval)

Minimal migration:

```text
entities.entities.visibility   ENUM('ACTIVE', 'HIDDEN')  NOT NULL DEFAULT 'ACTIVE'
reviews.reviews.visibility     ENUM('ACTIVE', 'HIDDEN')  NOT NULL DEFAULT 'ACTIVE'
users.users.role               ENUM('USER', 'ADMIN')     NOT NULL DEFAULT 'USER'
```

Indexes:

- `entities(visibility)` — optional; low cardinality but helps search filters.
- Partial index not required for MVP volume.

No new schemas/tables beyond enum columns.

---

## Stage 29 verification (post-implementation)

Manual / automated checks:

1. Admin hides entity `casino-spam-123.com` → search empty, resolve `not_found`, entity page `404`, extension card not shown.
2. Admin hides review `"BUY CRYPTO NOW"` → absent from entity page list; entity still visible.
3. Non-admin hide attempt → `403`.
4. Author `GET my-review` on hidden review → returns review with `visibility: HIDDEN`.
5. By-url rating on hidden canonical URL → rejected; no new public surface for spam.
6. Admin unhide entity → resolve `found` again.
7. Existing Stage 28 flows unchanged for `ACTIVE` content.

Verification via **curl / Docker smoke** is sufficient — no admin UI required.

---

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| Scope creep into "real moderation" | RFC non-goals; Stage 29 checklist tied to hide-only |
| Hidden URL blocks lazy recreate forever | Admin unhide API; canonical URL intentionally reserved |
| Leaking hidden state on public `404` | Public reads use generic not found |
| Admin bootstrap friction | Seed one admin user in dev; document promotion |
| Search/trust drift | ACTIVE-only filters at port/repository layer |

---

## Roadmap placement

```text
Stage 28  Lazy Entity Creation          ✅
    ↓
Stage 29  Content Hiding (this RFC)     ⬜ RFC approval → implement
    ↓
Stage 30  Testing Baseline
    ↓
Stage 31  MVP End-To-End Flow
    ↓
Stage 32  Production Readiness MVP
    ↓
Stage 33  MVP Stabilization
```

Moderation does **not** expand into Stages 30–33. Those stages stabilize and ship the existing MVP core.

---

## Recommended MVP decision summary

| Topic | Decision |
| ----- | -------- |
| Entity status | `ACTIVE` \| `HIDDEN` on entity row |
| Review status | `ACTIVE` \| `HIDDEN` on review row |
| Public hidden entity | `404` / resolve `not_found` |
| Public hidden review | Omitted from lists |
| Author sees hidden review | Yes, via `my-review` |
| Extension resolve | Hidden entity → `not_found` |
| Lazy rate on hidden URL | Blocked |
| Admin role | `USER` \| `ADMIN` only |
| Admin UI | None in Stage 29 |
| Reports / queues / workflow | Deferred post-MVP |
| API shape | `POST /moderation/entities/:id/hide`, `POST /moderation/reviews/:id/hide` (+ optional unhide) |

---

## Explicitly deferred (post-MVP RFCs)

- User report button ("flag this review")
- Moderation queue and reviewer assignment
- Appeals and status workflow
- Audit log of moderation actions
- Admin web dashboard
- Auto-hide / spam scoring / trust integration
- Hide individual ratings
- Ban/suspend users
- SEO `noindex` for hidden or low-trust entities

---

## References

- `docs/11-rfc/0007-lazy-entity-creation.md` — lazy create interactions
- `apps/api/prisma/schema.prisma` — current Entity/Review models
- `apps/api/src/modules/entities/services/entities.service.ts` — resolve / ensure
- `apps/api/src/modules/extension-api/` — resolve + by-url rating
- `apps/api/src/modules/moderation/moderation.module.ts` — empty module shell
- `project-management/01-master-plan.md` — Stages 29–33

---

## Approval

| Role | Name | Date | Status |
| ---- | ---- | ---- | ------ |
| Product / PM | User | 2026-06-27 | **Confirmed** |
| Backend | | | Pending |
| Extension | | | Pending |

**Next step:** implement **Stage 29 — Content Hiding** per this RFC.

---

## Confirmed Clarification (2026-06-27)

Internally the system must distinguish:

```text
NOT_FOUND   — no row for canonical URL
HIDDEN      — row exists with visibility = HIDDEN
```

Public/extension behavior is identical (`not_found` / `404`), but internal resolution uses `resolution: 'found' | 'not_found' | 'hidden'` so admin tooling, logs, and analytics can tell the difference later. Hidden content is **not** physically deleted.
