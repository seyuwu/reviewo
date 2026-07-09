# RFC 0012: Entity Presence Clusters

| Field | Value |
| ----- | ----- |
| Status | **Implemented** — 2026-07-09 |
| Scope | API clusters, `LINK_ENTITY` contribution, entity page UI |
| Depends on | RFC 0011 contributions, RFC 0009 `parent_id` (orthogonal) |
| Out of scope v1 | `entity_links`, aggregated cluster rating, extension UI, unlink contribution |

## Summary

Several Opinia entities can represent the **same real-world subject** (stub «роналдо», YouTube channel, Wikipedia article) without merging them into one page. Each presence keeps its own rating, reviews, and tops until an explicit `MERGE_ENTITY`.

This RFC adds:

1. **`EntityCluster` / `EntityClusterMember`** — horizontal identity grouping (distinct from `parent_id` hierarchy).
2. **`LINK_ENTITY` contribution** — moderation-tier proposal to link two entities; admin apply via existing resolve flow.
3. **Entity page «Связанные страницы»** — neighbors in the cluster with per-presence metrics.
4. **Contributions UX** — «Связать» next to duplicate «Объединить», plus manual link search modal.

`EntityMergeService` cleans up cluster membership when a merge is applied.

---

## Problem

| Today | User pain |
| ----- | --------- |
| Only `MERGE_ENTITY` for duplicates | Loses separate ratings when users only want related pages |
| `parent_id` is vertical (site → page) | Cannot express «same person, different URLs» |
| Duplicate suggestions only suggest merge | No lightweight «these are related» action |

---

## Data model

```text
EntityCluster
  id
  created_at

EntityClusterMember
  id
  cluster_id  → EntityCluster
  entity_id   → Entity (unique — at most one cluster per entity)
  created_at
```

**Link A + B:**

- Both unclustered → new cluster with both members.
- One clustered → add the other to that cluster.
- Different clusters → move all members into one cluster, delete the empty cluster.

**Merge source → target:**

- Remove source from cluster.
- If target not in cluster → add target to source's cluster.
- If target in another cluster → merge cluster members into target's cluster.
- Delete cluster if empty.

Self-links are rejected in `EntityClusterService`.

---

## API

| Method | Path | Purpose |
| ------ | ---- | ------- |
| `GET` | `/entities/:entityId/related-presences` | Cluster neighbors (excludes current entity) |
| `GET` | `/entities/:entityId/page` | Includes `relatedPresences` (like `parent`) |
| `POST` | `/entities/:entityId/contributions` | `LINK_ENTITY` payload `{ relatedEntityId, reason? }` |

Admin: `POST /admin/contributions/:id/resolve` with `action: "apply"` calls `EntityClusterService.linkEntities`.

---

## Contributions policy

- Type: `LINK_ENTITY`
- Tier: `MODERATION` (same trust ladder stage as merge in RFC 0011)
- Apply: `linkEntities(entityId, relatedEntityId)` where `entityId` is the contribution's entity

---

## Web UI

- **Entity page:** `EntityRelatedPresencesSection` when neighbors exist; hero anchor «Связанные страницы».
- **Contributions:** per-duplicate «Связать» button; manual `SuggestLinkModal`; admin queue shows `LinkContributionSummary`.

---

## Tests

- Unit: `entity-cluster.service.test.ts` — create, join, merge clusters, merge-entity cleanup.
- Integration: `contributions.integration.test.ts` — `LINK_ENTITY` apply + related presences; merge preserves cluster for target.

---

## Future (not v1)

- External `entity_links` without entity pages
- Aggregated cluster rating
- Extension cluster display
- `UNLINK_ENTITY` contribution
