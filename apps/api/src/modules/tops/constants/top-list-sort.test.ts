import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildTopListOrderBy, normalizeTopListSort } from "./top-list-sort.js";

describe("top list sort", () => {
  it("maps popular alias to likes", () => {
    assert.equal(normalizeTopListSort("popular"), "likes");
  });

  it("defaults unknown values to recent", () => {
    assert.equal(normalizeTopListSort("unknown"), "recent");
  });

  it("builds engagement order clauses", () => {
    assert.deepEqual(buildTopListOrderBy("comments")[0], { comments: { _count: "desc" } });
  });
});
