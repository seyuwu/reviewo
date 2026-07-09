import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TopRankMode } from "#prisma/client";

import { toTopListItemDto } from "./top-mapper.js";
import type { TopListRow } from "../repositories/tops.repository.js";

function createTopListRow(overrides: Partial<TopListRow> = {}): TopListRow {
  return {
    _count: {
      comments: 0,
      forks: 0,
      items: 5,
      likes: 0,
      views: 0
    },
    authorId: "author-1",
    category: null,
    categoryId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    description: null,
    forkedFromId: null,
    id: "top-1",
    rankMode: TopRankMode.MANUAL,
    slug: "sample-top",
    systemSortKey: null,
    title: "Sample Top",
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    visibility: "ACTIVE",
    ...overrides
  };
}

describe("toTopListItemDto", () => {
  it("uses active item count when provided", () => {
    const dto = toTopListItemDto(
      createTopListRow(),
      { displayName: "Author", id: "author-1" },
      2
    );

    assert.equal(dto.itemCount, 2);
  });

  it("falls back to stored item count when active count is missing", () => {
    const dto = toTopListItemDto(createTopListRow(), {
      displayName: "Author",
      id: "author-1"
    });

    assert.equal(dto.itemCount, 5);
  });
});
