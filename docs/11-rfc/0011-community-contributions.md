# RFC 0011: Community Contributions

| Field | Value |
| ----- | ----- |
| Status | **Confirmed** — 2026-07-06 |
| Scope | Entity metadata corrections and duplicate merges via community proposals |
| Depends on | Entity MVP, Ratings, Reviews, RFC 0008 (visibility), User Tops Phase 1 (RFC 0010) |
| Implements | Post–User Tops Phase 1 feature |

## Summary

Any editable entity field can be corrected through **community contributions**: users propose changes, others approve or reject, and safe changes auto-apply when weighted thresholds are met. Risky changes (merge, type, logo) require **moderation only** — never auto-apply.

This closes the duplicate/orphan entity gap (entities created without `canonical_url`, title-only stubs, lazy-creation collisions) without admin involvement for routine fixes.

---

## Problem

| Today | Gap |
| ----- | --- |
| Manual entity creation allows empty `canonicalUrl` | URL-based resolve and lazy creation do not link to title-only stubs |
| `title` is not unique | Search may show stub; extension rates a different entity |
| No merge | Duplicate entities accumulate |
| No field provenance | Users cannot tell community-verified data from author guesses |

---

## Non-Goals (v1)

- Full wiki edit history UI and rollback browser
- Talk pages / contribution discussion threads
- ML-based duplicate detection
- Auto-merge at any threshold
- Admin UI panel (admin API endpoints only)

---

## Data Model

Schema: `contributions`

### EntityContribution

| Field | Description |
| ----- | ----------- |
| `id` | UUID |
| `entityId` | Target entity |
| `authorId` | Proposer |
| `type` | `ContributionType` |
| `payload` | JSON with `oldValue`, `newValue`, merge fields |
| `status` | `PENDING` \| `APPROVED` \| `REJECTED` \| `APPLIED` \| `SUPERSEDED` |
| `tier` | `AUTO` \| `MODERATION` — fixed at creation |
| `approvalsWeight` / `rejectionsWeight` | Denormalized sums from votes |
| `resolvedAt` / `appliedAt` / `resolvedBy` | Audit |

### ContributionVote

One vote per `(contributionId, voterId)`. Weight from user trust (MVP: `1.0`).

### ContributionPolicy

Per-type thresholds stored in DB, seeded at migration. Supports activity scaling from entity `votesCount`.

### EntityFieldProvenance

Tracks UI badges: `title`, `description`, `canonicalUrl`, `logoUrl`, `type` — source `community` \| `author` \| `system`.

### Entity.logoUrl

New optional field on `entities.entities` for `UPDATE_LOGO` (moderation tier).

---

## Contribution Types

| Type | Tier | Notes |
| ---- | ---- | ----- |
| `UPDATE_NAME` | AUTO | Activity-scaled threshold |
| `UPDATE_URL` | AUTO | Lower threshold when `oldValue` is null (stub fix) |
| `UPDATE_DESCRIPTION` | AUTO | Lowest threshold |
| `UPDATE_LOGO` | MODERATION | Visual phishing risk |
| `UPDATE_TYPE` | MODERATION | Affects discovery filters |
| `MERGE_ENTITY` | MODERATION | **Never auto-apply** |

`CHANGE_CATEGORY` renamed to **`UPDATE_TYPE`** — Entity has `type`, not TopCategory.

---

## Hybrid Threshold Policies (seed defaults)

### Tier A — auto-apply

| Type | baseApproveWeight | activityScale | minUniqueVoters |
| ---- | ----------------- | ------------- | --------------- |
| `UPDATE_DESCRIPTION` | 2.0 | yes | 2 |
| `UPDATE_NAME` | 3.0 | yes | 2 |
| `UPDATE_URL` (stub) | 2.0 | no | 2 |
| `UPDATE_URL` (change) | 4.0 | yes | 3 |

```text
requiredApproveWeight = baseApproveWeight
  + (activityScale ? 0.5 * floor(log10(max(votesCount, 1))) : 0)

if tier=AUTO
   and effectiveApproval >= requiredApproveWeight
   and effectiveRejection < baseRejectWeight (default 2.0)
   and uniqueApprovers >= minUniqueVoters
  → APPLY
```

### Tier B — moderation only

`MERGE_ENTITY`, `UPDATE_TYPE`, `UPDATE_LOGO` stay `PENDING` until `POST /admin/contributions/:id/resolve`.

---

## Merge Cascade Rules

`EntityMergeService` merges `source → target` in one transaction:

| Table | Rule |
| ----- | ---- |
| `tops.top_items` | Repoint `entityId`; same top → keep lower position, drop duplicate row |
| `ratings` | Repoint; `@@unique(entityId, userId)` conflict → keep newer `updatedAt` |
| `reviews` | Repoint; `@@unique(authorId, entityId)` conflict → keep newer |
| `growth.battle_votes` | Repoint `entityId`; recompute `pair_key` where needed |
| `chat.entity_chat_messages` | Repoint `entityId` |
| `reputation.*` | Repoint entity-scoped rows; recalculate target profile |
| `entities.children` | `parentId` source → target |
| `entities` (source) | `visibility = HIDDEN` (soft delete) |

**Slug of target unchanged.** Source slug not reused.

---

## Duplicate Detection (heuristic)

```text
score = 0
+ 0.5 if normalized titles match
+ 0.4 if one's canonicalUrl matches expected URL of other
+ 0.3 if slugs match or slugFromUrl matches
+ 0.2 if both lack URL and title fuzzy match > 0.85
```

Show suggestions at score ≥ 0.7. User click creates `MERGE_ENTITY` contribution (moderation tier).

---

## API

| Method | Path | Auth |
| ------ | ---- | ---- |
| `POST` | `/entities/:entityId/contributions` | JWT |
| `GET` | `/entities/:entityId/contributions` | optional |
| `POST` | `/contributions/:id/vote` | JWT |
| `GET` | `/entities/:entityId/field-provenance` | public |
| `GET` | `/entities/:entityId/duplicate-suggestions` | public |
| `POST` | `/admin/contributions/:id/resolve` | JWT + Admin |

---

## Compatibility with User Tops

- Field updates (`name`, `url`, `description`) do not touch `top_items`.
- **MERGE** must run through `EntityMergeService` with `top_items` tests before production use.
- Dependency: ship after User Tops Phase 1 CRUD is stable.

---

## Anti-abuse

- One `PENDING` contribution per `(entityId, type)` — new proposal supersedes old
- Author cannot vote on own contribution
- Rate limit: contribution creates per user per day
- `UPDATE_URL`: reject if `newValue` already owned by another entity (409)

---

## Implementation Phases

1. **RFC + schema + policies seed**
2. **Backend:** create, vote, evaluate, apply safe fields
3. **Web:** suggest correction UI + provenance badges
4. **Merge service + admin resolve + duplicate suggestions**
5. **Logo field + UPDATE_LOGO moderation**

---

## Stage 1 Addendum (2026-07-07)

**Trust ladder Phase 1** — while the community is small:

- All contribution policies use `MODERATION` tier (admin-only apply).
- Web admin panel at `/admin`: global pending queue + stats.
- Editor Score in profile (read-only); Contributor/Moderator roles deferred.
- Community AUTO tiers (description first, then other fields) — Phase 2+.

---

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| Merge breaks tops unique constraint | Transaction + integration tests on `top_items` |
| Slug collision on URL attach | Check `canonical_url` unique before apply |
| Spam proposals | Rate limits + supersede + weighted votes |
| Moderation queue without UI | Admin API + logs until admin panel exists |
