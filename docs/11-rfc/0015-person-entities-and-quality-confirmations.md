# RFC 0015: Person Entities & Quality Confirmations

| Field | Value |
| ----- | ----- |
| Status | **Confirmed** — 2026-07-13 |
| Scope | Person entity ownership, entity attributes, quality confirmations, Dota vertical API |
| Depends on | RFC 0009 entities foundation, existing `EntityType.person` enum |
| Out of scope v1 | Search, LFG, Steam OAuth, red flags, text reviews, email notifications |

## Summary

Opinia can rate websites, products, and games. This RFC adds **people as first-class entities** with a low-friction reputation loop: one-click quality confirmations from teammates without registration.

The first vertical is **Dota** (`/dota/*`), isolated from the main discovery experience.

This RFC adds:

1. **`Entity.ownerUserId`** — links a `User` account to their public `Entity(type=person)`.
2. **`EntityAttribute`** — key-value fields (MMR, roles, Dota Account ID, vertical).
3. **`EntityQualityConfirmation`** — one-click green flags from anonymous or authenticated voters.
4. **`DotaModule`** — vertical-specific API facade for profile create/update/confirm.
5. **Web routes** — `/dota`, `/dota/create`, `/dota/[slug]`, `/dota/[slug]/confirm`, `/dota/id/[accountId]`.

---

## Problem

| Today | User pain |
| ----- | --------- |
| `EntityType.person` exists but is unused | No way to build player reputation on Opinia |
| Entity fields are fixed (title, description, URL) | Cannot store MMR, roles, Dota ID |
| Reviews require registration and text | Too much friction for post-game teammate feedback |
| No user ↔ entity identity link | Profile and account are disconnected |

In Dota Discord chats and party chat, players repeatedly write «4k sup, mic, not toxic». There is no portable reputation link they can share.

---

## Decision

**User ≠ Person Entity**

- `User` — platform account (auth, trust score).
- `Entity(type=person)` — public reputation object (ratings, confirmations, shareable URL).

Each user may own **at most one** person entity. They cannot create person pages for other real people.

**Quality confirmations over text reviews (v1)**

- Confirmations are one-click toggles (has mic, chill, good caller, etc.).
- No registration required to confirm.
- Progress milestone: **3 distinct confirmers** (not 3 flags).

**Vertical isolation**

- Dota profiles have `vertical=dota` attribute.
- Routes under `/dota/*` validate vertical before serving.
- Main Opinia home/discovery unchanged.

---

## Data model

```text
Entity (existing)
  + owner_user_id  UUID nullable, unique per person owner

EntityAttribute (new)
  entity_id  → Entity
  key        string
  value      text
  unique (entity_id, key)

EntityQualityConfirmation (new)
  id
  entity_id       → Entity
  quality_key     string
  confirmer_key   string (hash of visitor cookie / IP+UA)
  voter_user_id   UUID nullable → User
  created_at
  unique (entity_id, quality_key, confirmer_key)
```

### Dota attribute keys

| Key | Required | Notes |
| --- | -------- | ----- |
| `vertical` | yes | Always `dota` |
| `dota_account_id` | yes | 8–10 digit Dota Account ID; unique among dota profiles |
| `mmr` | no | Self-reported; labeled «указано игроком» |
| `roles` | no | JSON array e.g. `["4","5"]` |
| `server` | no | e.g. `EU`, `RU` |
| `language` | no | e.g. `ru`, `en` |
| `has_mic` | no | Self-reported `true`/`false` |
| `play_intent` | no | `fun`, `ranked`, `tournament` |

### Quality keys (green only, v1)

| Key | Label (ru) |
| --- | ---------- |
| `has_mic` | Есть микрофон |
| `chill` | Норм чел |
| `good_caller` | Хорошо колит |
| `stress_resistant` | Стрессоустойчивый |
| `good_support` | Хороший саппорт |

---

## Business rules

| Rule | Implementation |
| ---- | -------------- |
| 1 person per user | Unique `owner_user_id`; reject second create |
| Own profile only | `owner_user_id = currentUser.id` on create/update |
| Self-confirm forbidden | Block if confirmer is owner (by userId or fingerprint) |
| Progress 0/3 | Count distinct `confirmer_key` per entity |
| Vertical gate | `/dota/*` requires `vertical=dota` |
| 1 Dota ID per profile | Unique index on `dota_account_id` where vertical=dota |
| Dota ID unverified (v1) | No Steam OAuth; honesty + teammate confirmations |

---

## API

| Method | Path | Auth | Purpose |
| ------ | ---- | ---- | ------- |
| `POST` | `/dota/profiles` | JWT | Create person profile + attributes |
| `GET` | `/dota/profiles/me` | JWT | Own profile + progress |
| `PATCH` | `/dota/profiles/me` | JWT | Update attributes |
| `GET` | `/dota/profiles/:slug` | public | Public profile + flag aggregates |
| `GET` | `/dota/profiles/by-id/:accountId` | public | Resolve by Dota Account ID |
| `POST` | `/dota/profiles/:slug/confirm` | public | Submit quality keys |
| `GET` | `/entities/slug/:slug` | public | Generic slug lookup |

### Confirm request

```json
{
  "qualityKeys": ["has_mic", "chill", "good_caller"],
  "visitorId": "uuid-from-cookie"
}
```

### Profile response aggregates

```json
{
  "qualities": {
    "has_mic": 4,
    "chill": 3
  },
  "progress": {
    "target": 3,
    "current": 2
  }
}
```

---

## Anti-abuse (MVP)

- `confirmer_key` = SHA-256(`visitorId` cookie or IP+User-Agent fallback).
- Rate limit: max 10 confirmations/hour per IP.
- One confirmer per entity per 24h (optional soft limit).
- Self-confirm blocked for owner.

---

## Domain events

`quality.confirmation.created` — payload `{ entityId, ownerUserId, distinctConfirmers }`.

Handler logs only in v1; email notifications deferred (no email infra).

---

## Web routes

| Route | Purpose |
| ----- | ------- |
| `/dota` | Landing + search by Dota ID |
| `/dota/create` | Profile creation wizard |
| `/dota/[slug]` | Public profile |
| `/dota/[slug]/confirm` | Anonymous confirmation page |
| `/dota/id/[accountId]` | Redirect to profile by Dota ID |
| `/og/dota/[slug]` | OG image for Discord link previews |

Dota UI is **not** the generic `EntityPageView` — no canonical URL, hostname, or extension CTA.

---

## Security

- Cannot create person entities for other people (owner-only create).
- Impersonation via Dota ID: unique constraint + future Steam verification.
- Anonymous confirmers tracked by fingerprint, not PII.

---

## Tests

- Unit: `DotaProfileService` — create, confirm, self-confirm block, progress count, Dota ID uniqueness.
- Integration: full flow `POST /dota/profiles` → confirm → `GET` aggregates.
- Smoke: manual checklist section in `docs/testing/mvp-smoke-checklist.md`.

---

## Future (not v1)

- LFG status (`lfg_until` attribute)
- Red flags
- Text reviews on person profiles
- Steam OAuth + OpenDota MMR verification
- Search by MMR/roles
- Generalized `people/` module for CS2, Valorant, etc.
- Email notifications on new confirmations
