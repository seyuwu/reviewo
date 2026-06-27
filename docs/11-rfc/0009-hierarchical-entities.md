# RFC 0009: Hierarchical Entities & Extension Display Modes

| Field | Value |
| ----- | ----- |
| Status | **Proposed** — 2026-06-27 |
| Scope | API resolve + lazy create + extension UX |
| Depends on | Stage 9 entity model (`parent_id`), RFC 0007 lazy create |
| Phase 1 | Site parent in resolve, `parentId` on lazy create, extension settings + card |
| Phase 2 | Children endpoint, popup domain tree, entity breadcrumbs (implemented) |

## Summary

Today Reviewo resolves **one URL → one entity**. Users open many URLs under the same domain (`youtube.com/watch?v=…`, `github.com/org/repo`) that deserve **separate ratings**, while still relating to a **parent site** (`youtube.com`, `github.com`).

This RFC introduces:

1. **Hierarchical entities** via existing `entities.parent_id` and **site-root inference** (`https://youtube.com/`).
2. **Resolve enrichment** — `GET /extension/resolve` returns optional `parent` bundle (site entity + rating).
3. **Extension display modes** — user chooses what the auto-card and popup emphasize:
   - **Current page** (default)
   - **Parent website**
   - **Both** (compact stacked layout)
4. **Auto-dismiss timer** for the content card (default 3s, user-configurable, pauses on hover).
5. **Popup domain tree** (Phase 2) — children under the site parent inside the popup.

No `entity_relations` graph in MVP — only `parent_id` + site root.

---

## Problem

| Today | User pain |
| ----- | --------- |
| Card/popup show one resolve result | Video page shows video rating only; site rating invisible |
| `parent_id` unused in resolve/create | No tree, no breadcrumbs |
| No extension preferences | Cannot tune intrusiveness (auto-close, parent vs page) |

---

## Data model (unchanged schema)

```text
Entity
  id
  parent_id   nullable → site or logical parent
  canonical_url
  title
  type
```

**Site root** for any canonical URL:

```text
https://youtube.com/watch?v=abc  →  site root https://youtube.com/
https://github.com/piteren/pypoks → site root https://github.com/
```

**Lazy create rule (Phase 1):** when creating entity for a non-root URL, if site-root entity exists → set `parentId` to site entity.

**Not in Phase 1:** auto-create site parent when rating a deep link first.

---

## API

### Resolve (`GET /extension/resolve?url=`)

`found` response gains optional:

```typescript
parent?: {
  entity: ExtensionEntitySummary;
  rating: RatingAggregate;
  trust: TrustConfidence;
  web: { entityPagePath: string };
}
```

Rules:

- Load `parent` when site-root entity exists and differs from current entity canonical URL.
- If current entity is site root → omit `parent`.

### Children (Phase 2)

`GET /extension/entities/:parentId/children?limit=20`

Returns direct children (`parent_id = parentId`, `visibility = ACTIVE`) for popup tree.

---

## Extension preferences

Stored in `chrome.storage.local` → `reviewo.extensionPreferences`:

| Key | Type | Default |
| --- | ---- | ------- |
| `cardDisplayTarget` | `current` \| `parent` \| `both` | `both` |
| `autoDismissSeconds` | `0`–`30` (`0` = manual dismiss only) | `3` |

Settings screen: radio group + number input.

---

## Content card UX (Phase 1 — Variant 1)

Compact card, bottom-right, non-blocking:

```text
┌─────────────────────────┐
│ REVIEWO              ×  │
│ How to Learn JS         │
│ 4.2 / 5 · 123 ratings   │
│ ─────────────────────── │
│ Parent: YouTube           │
│ 4.8 / 5 · 15k ratings   │
│ [rate 1-5] [More details] │
└─────────────────────────┘
```

- **`current`** — only primary block (title + rating of current page).
- **`parent`** — only parent block (fallback to current if no parent).
- **`both`** — primary current + slim parent row (your preferred default).

**Auto-dismiss:** after `autoDismissSeconds`, card hides (tab dismiss map unchanged). Timer **pauses on hover/focus** inside card.

---

## Popup UX

### Phase 1

Home → **Current page** card + optional **Parent site** row (same modes as card).

### Phase 2

```text
YouTube ★4.8
├── youtube.com/watch?v=abc  ★4.2
├── youtube.com/@mrbeast
└── …
```

Entity screen opens child; breadcrumbs: `YouTube → Video title`.

---

## Out of scope

- Site-specific parsers (YouTube channel vs playlist types).
- `entity_relations` graph.
- Cross-domain parents.
- Web app hierarchy UI (extension first).

---

## Verification

- Resolve deep link returns `parent` when site entity exists.
- Lazy create sets `parentId` when site exists.
- Extension settings persist across reload.
- Card respects display mode + auto-dismiss.
- Popup shows parent row when resolve includes `parent`.

---

## Implementation phases

| Phase | Deliverable |
| ----- | ----------- |
| **1** | RFC, API parent in resolve, lazy `parentId`, extension prefs, card + popup parent row, auto-dismiss |
| **2** | Children endpoint, popup tree, recent grouped by domain |
| **3** | Web entity page breadcrumbs, retroactive parent linking job |
