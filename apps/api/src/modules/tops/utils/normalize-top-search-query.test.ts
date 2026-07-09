import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeTopSearchQuery } from "./normalize-top-search-query.js";

describe("normalizeTopSearchQuery", () => {
  it("returns undefined for empty values", () => {
    assert.equal(normalizeTopSearchQuery(undefined), undefined);
    assert.equal(normalizeTopSearchQuery(null), undefined);
    assert.equal(normalizeTopSearchQuery("   "), undefined);
  });

  it("trims and keeps non-empty queries", () => {
    assert.equal(normalizeTopSearchQuery("  best ai  "), "best ai");
  });

  it("caps query length", () => {
    const longQuery = "a".repeat(250);

    assert.equal(normalizeTopSearchQuery(longQuery)?.length, 200);
  });
});
