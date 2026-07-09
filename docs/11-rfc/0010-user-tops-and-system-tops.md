# RFC 0010: User Tops & System Tops

| Field | Value |
| ----- | ----- |
| Status | **Proposed** — 2026-07-06 |
| Scope | Top as first-class product object; User Top (UGC) + System Top (computed catalog) |
| Depends on | Entity MVP, Ratings, Reviews, Reputation (`entity_confidence_profiles`), RFC 0008 (visibility), Discovery `/top` |
| Phase 1 | User Top MVP — CRUD, public page, entity reverse lookup (`rankMode = MANUAL` only) |
| Phase 2 | System Top catalog — materialized snapshots, category slugs |
| Phase 3 | Social layer (likes, views, comments, forks) + constructor |
| Phase 4 | User Top rank modes — SYSTEM sort + HYBRID comparison view |
| Phase 2b | TopCategory taxonomy — browse/filter user tops at scale |

## Summary

Today Opinia has **Entity** (what you rate) and **Review** (why you rate). The `/top` page is a **global leaderboard** built from rating aggregates — useful, but not user-generated content.

This RFC introduces **Top** as a third first-class object:

```text
Entity   — the thing being rated
Review   — a full opinion on one entity
Top      — a curated ranked list of entities (container of opinion)
  ├─ title, description, author
  ├─ rankMode (MANUAL | SYSTEM | HYBRID)
  ├─ category (TopCategory — browse/discovery)
  └─ engagement (likes, views, comments, forks — Phase 3; storage TBD, not Phase 1 columns)
```

A Top is not just a sortable table. It is **user content**: «Лучшие AI для программистов», «Самые переоценённые игры Roblox», «Худшие интернет-провайдеры России». Each item can carry a short **note** — a micro-review inside the list (`#1 Cursor — лучший UX`).

Two kinds:

| Kind | Created by | Stored in DB | Ranking |
| ---- | ---------- | ------------ | ------- |
| **User Top** | User | Yes (`tops.tops`, `tops.top_items`) | `rankMode`-dependent (default: manual) |
| **System Top** | Platform | Definition in config; **snapshot** in DB or Redis | Computed from ratings + trust |

**Positioning fit:**

> If something exists — you can rate it.  
> If you can rate it — you can put it in a top.

**Implementation gate:** do **not** start Phase 1 until the core loop is validated (users rate, write reviews, return). This RFC is the design for the first major post-validation feature.

---

## Problem

| Today | Gap |
| ----- | --- |
| `GET /discovery/ratings/top` returns global entity ranking | No category-scoped tops (`ai-tools`, `universities-russia`) |
| `/top` UI shows votes / reliability tabs | No user-created lists, no editorial voice |
| No taxonomy for user tops | At scale (10k+ tops) browse/search becomes unusable without **TopCategory** |
| Entity page shows rating, reviews, chat, battles | No «appears in tops» — no graph between lists and entities |
| Backlog item «Collections and lists» | Unspecified; this RFC replaces it with **Top** |

Users come to rate, but they also come to **browse opinions**. User Tops turn curators into content creators. System Tops turn aggregate data into discoverable pages. Together they create **bidirectional navigation**: Entity ↔ Top.

---

## Non-Goals

- Replacing **Battles** (`/battles`, `/compare`) — complementary growth surface.
- Auto-ranking **User Tops** in Phase 1 — MVP is `MANUAL` only; SYSTEM / HYBRID modes are Phase 4 (see [Ranking Modes](#ranking-modes)).
- Full **entity tags** taxonomy — Phase 2 system tops start with `entity.type` filters; **TopCategory** is a separate browse axis for user tops (see [TopCategory](#topcategory)).
- **Comments**, **likes**, **views**, **forks**, **author subscriptions** on tops — Phase 3 (see [Engagement & Forks](#engagement--forks)).
- **Extension** integration for tops — deferred.
- Implementation before product validation of ratings + reviews retention.

---

## Architecture

```text
                    ┌─────────────────┐
                    │     Entity      │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
         ┌────────┐    ┌──────────┐   ┌─────────────┐
         │ Review │    │ User Top │   │ System Top  │
         │ (1:1   │    │ + items  │   │ snapshot    │
         │ entity)│    │ manual   │   │ computed    │
         └────────┘    └──────────┘   └─────────────┘
```

### User Top

A persisted record authored by a user. In Phase 1 ranking is **explicit** (`TopItem.position` 1..N, `rankMode = MANUAL`). Optional `note` per item bridges list and review without requiring a full review.

Future rank modes (SYSTEM, HYBRID) reuse the same `Top` / `TopItem` tables — see [Ranking Modes](#ranking-modes).

Future discovery (TopCategory) and growth mechanics (forks) extend the same `Top` row — see [TopCategory](#topcategory) and [Engagement & Forks](#engagement--forks).

### System Top

**Not** stored as user-generated rows. Stored as:

1. **Definition** — slug, title, filters, sort formula (code/config registry).
2. **Snapshot** — materialized result, refreshed on a schedule (cron).

Users read snapshots; they never trigger full recomputation on page load.

**Do not** run `SELECT … JOIN ratings … ORDER BY score` on every HTTP request.

---

## Data Model

### Schema: `tops` (Phase 1)

```prisma
enum TopVisibility {
  ACTIVE
  HIDDEN
}

enum TopRankMode {
  MANUAL    // Phase 1 — author sets position
  SYSTEM    // Phase 4 — Opinia sorts the author's entity set
  HYBRID    // Phase 4 — author order + Opinia order side by side
}

enum TopSystemSortKey {
  RATING        // avg_score within set
  POPULARITY    // votes_count within set
  TRENDING      // recent votes delta (discovery rising)
  RELIABILITY   // confidence_score / composite formula
}

model TopCategory {
  id          String   @id @default(uuid())
  slug        String   @unique   // e.g. "ai", "roblox", "universities"
  title       String             // display: "AI", "Roblox", "Universities"
  description String?
  sortOrder   Int      @default(0) @map("sort_order")
  createdAt   DateTime @default(now()) @map("created_at")
  tops        Top[]

  @@map("top_categories")
  @@schema("tops")
}

model Top {
  id             String            @id @default(uuid())
  slug           String            @unique
  title          String
  description    String?
  authorId       String            @map("author_id")
  categoryId     String?           @map("category_id")      // Phase 2 UX; nullable FK from Phase 1
  forkedFromId   String?           @map("forked_from_id")   // Phase 3 — source top if fork
  visibility     TopVisibility     @default(ACTIVE)
  rankMode       TopRankMode       @default(MANUAL) @map("rank_mode")
  systemSortKey  TopSystemSortKey? @map("system_sort_key")
  createdAt      DateTime          @default(now())
  updatedAt      DateTime          @updatedAt
  category       TopCategory?      @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  forkedFrom     Top?              @relation("TopForks", fields: [forkedFromId], references: [id], onDelete: SetNull)
  forks          Top[]             @relation("TopForks")
  items          TopItem[]

  @@index([authorId])
  @@index([categoryId])
  @@index([forkedFromId])
  @@index([visibility])
  @@index([rankMode])
  @@map("tops")
  @@schema("tops")
}

model TopItem {
  id        String   @id @default(uuid())
  topId     String   @map("top_id")
  entityId  String   @map("entity_id")
  position  Int      // author position; authoritative when rankMode = MANUAL | HYBRID
  note      String?  // max 280 chars
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  top       Top      @relation(fields: [topId], references: [id], onDelete: Cascade)

  @@unique([topId, entityId])
  @@unique([topId, position])
  @@index([entityId])
  @@map("top_items")
  @@schema("tops")
}
```

**Phase 1 constraint:** API accepts only `rankMode = MANUAL`; `systemSortKey` must be null. Enum values exist in schema for forward compatibility — no migration when Phase 4 ships.

**Rules:**

- **One entity per top, exactly once** — enforced by `@@unique([topId, entityId])`. A top cannot list Cursor at #1 and #5. See [Open Questions](#open-questions).
- Positions are dense: 1, 2, 3, … without gaps after publish.
- Item count: **3 minimum**, **50 maximum** (open for adjustment).
- `note`: optional, max **280** characters.
- `slug`: unique globally; reserved prefix `system-` blocked for user tops (system slugs live in a separate namespace — see Routes).
- `visibility`: reuse RFC 0008 hide pattern (`HIDDEN` = soft moderation).

**Phase 1 schema** includes nullable `categoryId`, `forkedFromId`, and `rankMode` / `systemSortKey` enums for forward compatibility. **Engagement counters are not in Phase 1** — storage strategy is decided in Phase 3 (see [Engagement & Forks](#engagement--forks)).

**Phase 1 API surface:** no category picker required; no engagement metrics; fork endpoints absent.

### System Top Definition (Phase 2 — config, not user table)

```typescript
interface SystemTopDefinition {
  slug: string;           // e.g. "ai-tools"
  title: string;
  description: string;
  filters: {
    entityTypes?: EntityType[];
    parentId?: string | null;   // site subtree
    // tags?: string[]         // when taxonomy exists
  };
  sort: "reliability" | "votes" | "composite";
  minVotes: number;           // default higher than global MIN_TOP_VOTES (e.g. 5)
  limit: number;              // snapshot size, default 20
}
```

Registry starts with **5–10** definitions in code (`apps/api/src/modules/tops/system-top-definitions.ts` or similar). Admin UI deferred.

### System Top Snapshot (Phase 2 — materialized)

```prisma
model SystemTopSnapshot {
  definitionSlug String   @map("definition_slug")
  computedAt     DateTime @map("computed_at")
  items          Json     // [{ entityId, position, score }]

  @@id([definitionSlug, computedAt])
  @@index([definitionSlug, computedAt(sort: Desc)])
  @@map("system_top_snapshots")
  @@schema("tops")
}
```

Read path: latest snapshot per `definition_slug`. Optional Redis cache (`top:system:{slug}`) for hot slugs — not required for MVP.

---

## TopCategory

**TopCategory** is the browse taxonomy for **user tops** — not the same as `entity.type` (used to filter System Top definitions) and not free-form tags.

Without categories, at 10k–50k user tops global search and «recent» feeds break down. Categories power **discovery**, not ranking.

### Seed categories (platform registry)

**43 curated categories** in `apps/api/prisma/top-categories.registry.mjs` (seed + migration). Groups: Tech & AI, Media, Life & places, Business, Education & people, Web, plus fallback `other`.

Examples:

| slug | title | Example tops |
| ---- | ----- | -------------- |
| `ai` | AI | Лучшие AI для программистов |
| `games` | Games | Топ RPG 2026 |
| `movies` | Movies | Лучшие фильмы Нолана |
| `startups` | Startups | Лучшие SaaS для команд |
| `other` | Other | Всё, что не лезет в остальные |

**Admin-managed registry only** — `POST /tops/categories` requires `ADMIN`. User-created categories were removed; migration reassigns orphan tops to `other` and deletes junk slugs.

Optional later: **secondary tags** on tops (`#startup`, `#moscow`) — out of scope until category browse is proven.

### Model

- `TopCategory` — platform table, slug + title + `sortOrder`.
- `Top.categoryId` — optional FK; one primary category per top.
- System Top definitions may **reference** the same category slug for IA consistency, but System Tops do not live in `tops.tops`.

### UX (Phase 2b)

- Create top: **searchable category picker** (required; select from registry only).
- `/tops` hub: **searchable combobox** filter (not horizontal chips).
- `/tops/category/:slug` — tops in category, sortable by recent / popular / most forked.
- Search: `?q=` scoped to category when filter active.

### Phase timing

| When | What |
| ---- | ---- |
| **Phase 1** | `categoryId` nullable in schema; API ignores |
| **Phase 2b** | Seed categories, picker on create, browse routes |
| **Phase 3+** | Sort feeds by engagement within category (metric storage TBD) |

**Do not wait until 50k tops** — ship category browse when `/tops` hub launches (Phase 2b, alongside or right after System Top catalog).

### Risks

| Risk | Mitigation |
| ---- | ---------- |
| Wrong category on create | Author can change category; moderators can reassign later |
| Too many categories | Platform-only registry (~43 slugs); admin-only create; `other` fallback |
| Category ≠ entity type mismatch | Category describes **top topic**, not entity schema — «AI top» can include `product` + `website` entities |

---

## Engagement & Forks

Top engagement mirrors content platforms: metrics drive discovery; **fork** drives content multiplication.

### Engagement metrics (Phase 3 — storage TBD)

API exposes counts on read; **how** they are stored is an implementation decision in Phase 3, not a Phase 1 schema commitment:

| Metric | Meaning | Candidate storage |
| ------ | ------- | ----------------- |
| `likesCount` | Useful / agree | `top_likes` junction → COUNT, or denormalized column, or Redis |
| `viewsCount` | Page impressions | Event log + async rollup, Redis, or column |
| `commentsCount` | Discussion thread | `top_comments` → COUNT or denormalized column |
| `forksCount` | Forks spawned | `COUNT(*) WHERE forked_from_id = ?` or denormalized column |

**Do not add `likes_count` / `views_count` / `comments_count` / `forks_count` to `tops.tops` in Phase 1.** A migration adding four `int` columns later takes minutes; premature counters lock in the wrong pattern (e.g. you may prefer `RatingAggregate`-style materialization, Redis for hot reads, or async recount jobs).

Displayed on top page header (Phase 3):

```text
♥ 128   👁 4.2k   💬 34   🔀 12 форков
```

### Fork — «Создать свою версию»

User B sees User A's top «Лучшие AI для программистов» and clicks **Создать свою версию**.

Result:

1. New `Top` row owned by User B.
2. `forkedFromId` → source top id.
3. **Deep copy** of all `TopItem` rows (entity, position, note) into the new top.
4. New slug/title — default: «{original title} (версия {author username or display name})» — editable before publish.
5. Source top fork count increases (however forks are counted in Phase 3 storage).

Attribution on forked top page:

```text
Основан на топе «Лучшие AI для программистов» — @authorA
```

Link to source top. Source top page shows «N форков» → list of forks (count from `GET /tops/:id/forks` or materialized metric).

**Fork is not a live sync** — copy-on-fork. Edits to the original do not propagate (GitHub fork semantics, not branch). Keeps ownership clear.

**Fork chain:** allow `forkedFromId` to point to any top; display **immediate parent** only («Основан на…»). Optional `rootTopId` denormalized later if fork-of-fork analytics needed — not Phase 3.

### Fork UX flow (Phase 3)

1. On any public user top: button **Создать свою версию** (JWT required).
2. Opens editor pre-filled: title, description, items, notes, category from source.
3. User reorders, adds/removes entities, edits notes, publishes new slug.
4. Redirect to new top; attribution badge visible.

### API (Phase 3 extensions)

| Method | Path | Description |
| ------ | ---- | ----------- |
| `POST` | `/tops/:id/fork` | Create draft fork copy; returns new top id |
| `GET` | `/tops/:id/forks` | List forks of this top (public) |
| `POST` | `/tops/:id/like` | Toggle like |
| `POST` | `/tops/:id/view` | Increment view |
| `GET/POST` | `/tops/:id/comments` | Comments thread |
| `POST` | `/users/:id/follow` | Follow author for new tops |

`GET /tops/:slug` response gains:

```typescript
interface TopDto {
  // ...existing fields
  category?: { slug: string; title: string };
  likesCount?: number;      // Phase 3 — computed or materialized
  viewsCount?: number;
  commentsCount?: number;
  forksCount?: number;
  forkedFrom?: { slug: string; title: string; author: { id: string; displayName: string } };
}
```

### Why fork is high-value

- Lowers barrier to first top («start from a good template»).
- Creates **debate graphs**: fork A vs fork B vs original.
- Pairs naturally with **HYBRID** rank mode (Phase 4): fork, reorder, compare your taste vs Opinia.
- SEO: many variants of the same topic, each with unique author voice.

### Phase timing

| Capability | Phase | Rationale |
| ---------- | ----- | --------- |
| `forkedFromId` column | **1** (nullable FK) or **3** migration | Lightweight; fork is core to Phase 3 UX |
| Engagement storage | **3** | Decide aggregates vs columns vs Redis when implementing |
| Likes, views, comments | **3** | Social proof for discovery |
| Fork | **3** | Content multiplication; needs CRUD + editor from Phase 1 |
| Feed sorted by likes/forks within category | **3** | Needs engagement metrics + categories |

### Risks (forks)

| Risk | Mitigation |
| ---- | ---------- |
| Spam forks | Rate limit forks per user/day; fork requires JWT |
| Attribution stripped | `forkedFromId` immutable after publish; UI always shows parent |
| Near-duplicate tops | Discovery dedup deferred; category + search sufficient for v1 |
| Fork of SYSTEM-ranked top | Copy items + `rankMode`; author may change mode in Phase 4 |

---

## Ranking Formula (System Tops)

Global `/discovery/ratings/top` already sorts by `votes_count` or `confidence_score` from `reputation.entity_confidence_profiles`.

System tops use a **composite score** to avoid «2 votes × 10/10 = #1 in the world»:

```text
rank_score = avg_score × confidence_score × ln(1 + votes_count)
```

Where:

- `avg_score` — from `ratings.rating_aggregates`
- `confidence_score` — from `reputation.entity_confidence_profiles`, with MVP fallback (same as `listTopEntitiesByReliability`)
- `votes_count` — from `ratings.rating_aggregates`
- `minVotes` — per-definition threshold (recommended **≥ 5** for category tops vs current global `MIN_TOP_VOTES = 1`)

Sort: `rank_score DESC`, tie-break `votes_count DESC`, then `avg_score DESC`.

**Refresh:** cron every **1 hour** (or **24 hours** for low-traffic slugs). Recompute writes new snapshot row; readers always fetch latest.

---

## Ranking Modes

User Tops can be ranked in three ways. **System Top** (platform catalog) is a separate product object — it always uses computed ranking. This section covers **rank modes on User Tops**.

### Overview

| Mode | Who sets order | Primary display | Phase |
| ---- | -------------- | --------------- | ----- |
| **MANUAL** | Author (drag & drop) | `TopItem.position` | **1 (MVP)** |
| **SYSTEM** | Opinia (within author's entity set) | Computed order by `systemSortKey` | **4** |
| **HYBRID** | Author sets order; Opinia order shown alongside | Author list + «Позиция Opinia» per row | **4** |

**Recommendation: yes, support multiple modes — but not in MVP.**

- **MANUAL** is the only mode needed to validate «will people create tops».
- **SYSTEM** on a user top is a lighter variant of System Top catalog — useful when author wants curation without ranking labour.
- **HYBRID** is the highest-value future mode: it turns a static list into **debate fuel** (author vs community). Worth building, but only after enough rating density exists inside typical top entity sets.

Do **not** ship SYSTEM or HYBRID before Phase 2 system-top infrastructure (composite formula, snapshot/cron patterns) is proven.

### MANUAL (Phase 1 — MVP)

Author manually orders items. `TopItem.position` is the single source of truth.

```text
#1 Cursor      — лучший UX
#2 Claude Code — лучший код
#3 Gemini CLI  — лучший бесплатный вариант
```

- Constructor: search entities → add cards → **drag & drop** reorder → optional note per row.
- `PUT /tops/:id/items` sends full ordered `[{ entityId, note? }]`.
- No Opinia position column, no cron, no sort-key picker.

### SYSTEM (Phase 4)

Author chooses **which** entities belong in the top; Opinia chooses **in what order**.

```text
Лучшие AI для программистов
Сортировка: по надёжности Opinia

#1 Claude Code   ★ 9.4  ·  1 200 оценок
#2 Cursor        ★ 9.1  ·    890 оценок
#3 Gemini CLI    ★ 8.7  ·    340 оценок
```

- `Top.rankMode = SYSTEM`, `Top.systemSortKey` = `RATING` | `POPULARITY` | `TRENDING` | `RELIABILITY`.
- `TopItem.position` is **not authoritative** — either unused or rewritten on each refresh (prefer **computed at read**, not stored).
- Sort scope: **only entities in this top's item set**, not global leaderboard.
- Constructor UX: add/remove entities (no drag). Optional «Пересортировать» preview before publish.
- Display order changes when aggregates update — show `sortedAt` timestamp: «Порядок обновлён 2 ч назад».

**Relation to System Top catalog:** System Top = platform-owned definition + filters. SYSTEM user top = author-owned title/description/notes + auto-sort within a hand-picked set. Different objects, shared sort engine.

### HYBRID (Phase 4)

Author order is primary; Opinia order is **secondary metadata** on each row — the discussion hook.

```text
#1 Cursor
   Автор: #1  ·  Opinia: #3  ▼2

#2 Claude Code
   Автор: #2  ·  Opinia: #1  ▲1

#3 Gemini CLI
   Автор: #3  ·  Opinia: #2
```

- `Top.rankMode = HYBRID`.
- `TopItem.position` = **author position** (never overwritten by cron).
- `systemPosition` = **computed field** in API response, not a DB column.
- Default `systemSortKey` for hybrid comparison: `RELIABILITY` (composite formula). Configurable later.
- Delta badge: `authorPosition - systemPosition` (positive = author ranks higher than community).
- List sorted by **author position** always; Opinia column is annotation.

**Why not store `systemPosition` in DB:** it goes stale. Compute on read from `rating_aggregates` + `entity_confidence_profiles` for the top's entity IDs, or attach a lightweight per-top snapshot refreshed hourly (same cron as System Tops).

**Cold start:** if an entity has `< minVotes` in the set, show «Opinia: мало данных» instead of a position — avoids misleading #1 from 2 votes.

### Data model impact

| Concern | MANUAL | SYSTEM | HYBRID |
| ------- | ------ | ------ | ------ |
| `Top.rankMode` | `MANUAL` | `SYSTEM` | `HYBRID` |
| `Top.systemSortKey` | `null` | required | required (comparison metric) |
| `TopItem.position` | authoritative | optional / ignored | author-only |
| `systemPosition` in DB | — | — | **no** — computed |
| Per-top snapshot table | — | optional (perf) | optional (perf) |
| Cron job | — | optional refresh | shared with System Top engine |
| Unique `(top_id, position)` | yes | N/A if position not stored | yes (author positions) |

**Phase 1 schema ships `rankMode` + `systemSortKey` columns with default `MANUAL` / `null`.** Zero UX surface; avoids painful migration in Phase 4.

Optional Phase 4 table (only if read perf needs it):

```prisma
model UserTopRankSnapshot {
  topId      String   @map("top_id")
  computedAt DateTime @map("computed_at")
  items      Json     // [{ entityId, systemPosition, score }]

  @@id([topId, computedAt])
  @@map("user_top_rank_snapshots")
  @@schema("tops")
}
```

### Constructor UX impact

| Step | MANUAL (Phase 1) | SYSTEM (Phase 4) | HYBRID (Phase 4) |
| ---- | ---------------- | ---------------- | ---------------- |
| Mode picker at create | Hidden (MANUAL only) | «Ручной» / «По Opinia» / «Сравнить с Opinia» | same |
| Add entities | Search + cards | Search + cards | Search + cards |
| Ordering | Drag & drop | None — preview auto-order | Drag & drop (author order) |
| Notes per item | Yes | Yes | Yes |
| Sort key picker | — | Dropdown: рейтинг / голоса / тренд / надёжность | Dropdown for Opinia column |
| Publish preview | Final list | List + «так Opinia расставит» | List + ghost Opinia column |

Phase 1 constructor is **MANUAL-only** — no mode picker, no sort key, no Opinia preview. Keeps MVP scope tight.

Phase 3 constructor (entity search + drag) ships with MANUAL. Phase 4 adds mode picker and conditional UI (hide drag when SYSTEM).

### API response shape (Phase 4 extension)

```typescript
interface TopItemDto {
  entityId: string;
  position: number;           // author position (MANUAL + HYBRID)
  note?: string;
  systemPosition?: number;    // HYBRID + SYSTEM display
  systemScore?: number;       // optional transparency
  positionDelta?: number;     // author - system (HYBRID)
  systemPositionStatus?: "ok" | "insufficient_data";
}
```

`GET /tops/:slug` returns `rankMode`, `systemSortKey`, and per-item computed fields when applicable.

### MVP vs V2/V3 vs V4

| Capability | When | Rationale |
| ---------- | ---- | --------- |
| `rankMode = MANUAL` only | **Phase 1 (MVP)** | Validates UGC tops without sort-engine complexity |
| `rankMode` enum in schema | **Phase 1** | Forward-compatible; no migration later |
| System Top catalog (platform) | **Phase 2** | Objective tops; proves materialized ranking |
| Constructor with search + drag | **Phase 3** | Better creation UX; still MANUAL |
| `rankMode = SYSTEM` on user tops | **Phase 4** | Needs sort engine + enough per-entity votes |
| `rankMode = HYBRID` | **Phase 4** | Needs SYSTEM infrastructure + meaningful deltas |
| User-chosen `systemSortKey` per top | **Phase 4+** | Start with one default (`RELIABILITY`) |

**Do not defer HYBRID to «someday»** — it is a core differentiator. But **do defer it past MVP**; shipping HYBRID before users create manual tops is premature optimization.

### Risks (rank modes)

| Risk | Mitigation |
| ---- | ---------- |
| HYBRID with sparse data looks broken | `insufficient_data` state; hide delta badge |
| SYSTEM mode order shifts confuse readers | `sortedAt` label; author note explains intent |
| Mode picker overwhelms new users | Default MANUAL; advanced modes behind «Дополнительно» |
| Author edits items in HYBRID top | Recompute system positions; author positions unchanged |
| SYSTEM user top ≈ duplicate of System Top | Different framing: author voice + notes + custom title |

---

## API (sketch)

### Phase 1 — User Tops

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| `POST` | `/tops` | JWT | Create top (title, description, slug) |
| `GET` | `/tops/:slug` | Public | Top detail + items (entity summary per item) |
| `PATCH` | `/tops/:id` | JWT owner | Update title, description |
| `DELETE` | `/tops/:id` | JWT owner | Soft-delete → `visibility = HIDDEN` |
| `PUT` | `/tops/:id/items` | JWT owner | Replace ordered items `[{ entityId, note? }]` |
| `GET` | `/entities/:id/tops` | Public | User tops containing this entity (reverse lookup) |
| `GET` | `/users/:id/tops` | Public | Tops by author |

**Item replace semantics:** client sends full ordered list; server validates entities exist, are `ACTIVE`, no duplicates, count 3–50, rewrites positions.

### Phase 2 — System Tops

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| `GET` | `/tops/system` | Public | Catalog of available system top slugs + titles |
| `GET` | `/tops/system/:slug` | Public | Latest snapshot + entity summaries |
| `GET` | `/entities/:id/system-tops` | Public | System tops where entity appears in latest snapshot |

Internal (not public HTTP):

- `SystemTopRefreshJob` — cron-triggered recompute for all definitions.

### Phase 3 — Social & Forks

| Method | Path | Description |
| ------ | ---- | ----------- |
| `POST` | `/tops/:id/like` | Toggle like (JWT) |
| `POST` | `/tops/:id/view` | Increment view (anonymous ok, rate-limited) |
| `GET/POST` | `/tops/:id/comments` | Top comments thread |
| `POST` | `/tops/:id/fork` | Create editable copy; sets `forkedFromId` |
| `GET` | `/tops/:id/forks` | List public forks of this top |
| `POST` | `/users/:id/follow` | Follow author for new tops |

Comment storage: **separate** `tops.top_comments` table (not reuse `reviews.reviews` — different subject). Like storage: `tops.top_likes` junction. Decision locked in Phase 3 design; not blocking Phase 1.

### Phase 2b — TopCategory

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` | `/tops/categories` | List `TopCategory` registry |
| `GET` | `/tops/category/:slug` | User tops in category (paginated, sortable) |

`POST /tops` and `PATCH /tops/:id` accept optional `categoryId` once Phase 2b ships.

---

## Routes & Information Architecture

Align with [`docs/product/web-discovery-and-battles.md`](../product/web-discovery-and-battles.md):

| Route | Purpose | Phase |
| ----- | ------- | ----- |
| `/top` | **Global system leaderboard** (existing — votes / reliability) | Now |
| `/tops` | User tops discovery feed (recent, popular) | 1 |
| `/tops/new` | Create user top | 1 |
| `/tops/:slug` | User top page | 1 |
| `/tops/category/:slug` | User tops filtered by TopCategory | 2b |
| `/tops/categories` | Category index (optional standalone page) | 2b |
| `/top/:systemSlug` | System top page (e.g. `/top/ai-tools`) | 2 |

**Slug collision rule:**

- User tops: `/tops/{slug}` namespace.
- System tops: `/top/{slug}` namespace (singular, matches existing `/top` hub).
- User slug cannot equal a registered system slug.

Header nav: keep **🏆 Топы** → `/top` hub; Phase 2 adds tabs or sub-nav: «Рейтинг» | «Каталог» | «Пользовательские»; Phase 2b adds category chips on «Пользовательские».

---

## UX Flows

### Create User Top (Phase 1 — MANUAL only)

1. User clicks «Создать топ» → form: title, description, slug.
2. Search/add entities (reuse entity search).
3. Drag to reorder; optional note per row.
4. Publish (min 3 items).
5. Public page: author, title, description, numbered list with entity cards + notes.

No rank mode picker in Phase 1 — all tops are `MANUAL`.

### Create User Top (Phase 4 — mode picker)

1. Same as Phase 1, plus **режим сортировки**:
   - **Ручной порядок** (MANUAL) — drag & drop
   - **По рейтингу Opinia** (SYSTEM) — pick sort key, no drag
   - **Сравнить с Opinia** (HYBRID) — drag + Opinia column on preview and public page
2. Publish preview shows mode-specific layout.
3. Public page renders per `rankMode` (see [Ranking Modes](#ranking-modes)).

### Entity page — «Входит в топы» (Phase 1 + 2)

```text
Входит в топы
  #1 Лучшие AI для программистов     → /tops/best-ai-for-devs-2026
  #3 Лучшие инструменты для стартапов → /tops/startup-tools
  #2 AI Tools (системный)             → /top/ai-tools
```

Phase 1: user tops only. Phase 2: add system tops from snapshot reverse index.

### Constructor (Phase 3 — MANUAL; Phase 4 — all modes)

**Phase 3:** User types «Лучшие университеты Москвы» → system suggests entities from search → drag cards → publish. Title/description pre-filled from prompt; entities suggested, **not** auto-ranked. Rank mode remains MANUAL.

**Phase 4:** Mode picker unlocks SYSTEM (no drag, sort key) and HYBRID (drag + live Opinia preview column).

### Fork top (Phase 3)

1. Reader opens «Лучшие AI для программистов» by @authorA.
2. Clicks **Создать свою версию**.
3. Editor opens with copied title/items/notes; user edits order, adds Gemini, removes Windsurf.
4. Publishes «Лучшие AI для программистов — моя версия».
5. New top shows: «Основан на топе @authorA»; source top fork list/count updates.

---

## Bidirectional Navigation

```text
Entity page                    Top page
───────────                    ────────
Rating: 9.1                    Лучшие AI для программистов
                               #1 Cursor — лучший UX
Входит в топы:                 #2 Claude Code — лучший код
  #1 Лучшие AI…  ──────────►   #3 Gemini CLI
  #3 Startup tools             ...
       ▲                              │
       └──────────────────────────────┘
              (each item links to entity)
```

This drives internal page views without a recommendation engine.

---

## Moderation & Abuse

- Reuse `TopVisibility.HIDDEN` per RFC 0008 (no reports queue in Phase 1).
- Rate-limit top creation per user (e.g. 10/day).
- Block hidden entities from being added to tops.
- Author can hide own top.

---

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| Spam / low-quality tops | Creation rate limits; min 3 items; hide visibility |
| Duplicate entities in one top | **Impossible** — `@@unique([topId, entityId])`; API rejects duplicate `entityId` in `PUT /tops/:id/items` |
| System top cold start (few entities in category) | Higher `minVotes`; show «мало данных» empty state |
| Slug squatting | Reserved system slugs; slug change by author limited |
| Scope creep before validation | Phase gate: confirm retention metrics before Phase 1 code |
| Compute cost on system tops | Materialized snapshots only; never per-request aggregation |
| 50k tops without categories | Ship TopCategory browse in Phase 2b; don't wait for scale pain |
| Fork spam / duplicate feed | Rate limits; category-scoped discovery |

---

## Open Questions

| Question | Recommendation |
| -------- | -------------- |
| Default visibility for new tops | **Public** (`ACTIVE`) |
| Max items per top | **50** |
| Min items to publish | **3** |
| User top edit after publish | Allow reorder + note edit; slug immutable after first publish |
| System top slug ownership | Platform-only registry; no user collision |
| Comments on tops vs reviews | Separate `top_comments` in Phase 3 |
| Default `rankMode` for new tops | **MANUAL** |
| When to ship SYSTEM / HYBRID | **Phase 4** — after System Top catalog + constructor |
| Default `systemSortKey` for HYBRID | **RELIABILITY** (composite formula) |
| Store `systemPosition` in DB | **No** — compute on read or hourly per-top snapshot |
| Allow switching `rankMode` after publish | **Phase 4** — yes, with re-preview; MANUAL→SYSTEM drops author positions |
| TopCategory required on create | **Phase 2b** — yes, once registry ships; optional before |
| Category registry ownership | **Platform-only** seed; ~7–12 categories v1 |
| Fork sync with parent | **No** — copy-on-fork; GitHub-style |
| Show fork chain depth | **Immediate parent only** in Phase 3 |
| Multiple categories per top | **No** — one `categoryId`; tags later if needed |
| Same entity twice in one top | **No** — one row per `(top, entity)`; unique index is intentional (top = ranked set, not bag) |
| Engagement counter storage | **Decide in Phase 3** — options: denormalized columns, `COUNT` from junction tables, Redis, async aggregate job; **not** in Phase 1 schema |
| Pre-add counter columns in Phase 1 | **No** — trivial migration later; avoids wrong abstraction |

---

## Implementation Phases

| Phase | Deliverable | Estimate |
| ----- | ----------- | -------- |
| **0** | No code — validate ratings/reviews retention | — |
| **1** | `tops` schema, User Top CRUD API, `/tops/:slug` web, entity «В пользовательских топах», moderation visibility | ~2–3 weeks |
| **2** | System top definitions, snapshot job, `/top/:systemSlug`, entity system-top block, discovery feed section | ~2 weeks |
| **2b** | TopCategory registry, category picker, `/tops/category/:slug` browse | ~1 week |
| **3** | Likes, views, comments, **fork**, author follow, constructor UI (MANUAL) | ~3 weeks |
| **4** | User top rank modes: SYSTEM + HYBRID, sort key picker, Opinia comparison column, shared sort engine with System Tops | ~2 weeks |

---

## Verification (Phase 1)

- Create top with 3+ entities, notes, manual order.
- Public `GET /tops/:slug` returns items in position order.
- `GET /entities/:id/tops` lists tops containing entity.
- Hidden top/entity not shown publicly.
- Slug uniqueness enforced; system slug prefix blocked for users.
- `PUT /tops/:id/items` rejects duplicate `entityId` in one payload (409 / validation error).

## Verification (Phase 2)

- Cron produces snapshot; `GET /tops/system/:slug` serves latest without live aggregation.
- Entity with rank in snapshot appears in `GET /entities/:id/system-tops`.
- Composite formula excludes low-vote outliers from top positions.

## Verification (Phase 2b)

- `GET /tops/categories` returns seeded registry.
- Top created with `categoryId` appears in `GET /tops/category/:slug`.
- Top without category still listable on global `/tops` until category required.

## Verification (Phase 3)

- Like toggles liked state; `likesCount` in response matches chosen storage strategy.
- View recorded once per session/window; `viewsCount` consistent.
- Comment creates row; `commentsCount` consistent.
- Fork creates new top with copied items, `forkedFromId` set; source fork count/list updates.
- Forked top shows attribution link; edits to source do not affect fork.

## Verification (Phase 4)

- Create HYBRID top: author order preserved; `systemPosition` differs when ratings differ.
- Create SYSTEM top: display order matches `systemSortKey` within entity set.
- Entity with `< minVotes` shows `insufficient_data` in HYBRID column.
- Phase 1 API rejects `rankMode != MANUAL`; Phase 4 PATCH allows mode change with validation.
- Cron/snapshot refreshes system positions without mutating `TopItem.position` in HYBRID mode.

---

## Related

- [`docs/product/web-discovery-and-battles.md`](../product/web-discovery-and-battles.md) — current `/top`, discovery API
- [RFC 0008](./0008-content-hiding-moderation-mvp.md) — visibility / hiding pattern
- [`apps/api/src/modules/discovery/repositories/discovery.repository.ts`](../../apps/api/src/modules/discovery/repositories/discovery.repository.ts) — existing top-ratings queries
- [`project-management/02-backlog.md`](../../project-management/02-backlog.md) — «Collections and lists» → this RFC

**Next step:** confirm product validation criteria for Phase 0 exit, then approve RFC for Phase 1 implementation.
