import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildReviewWhere } from "./review-locale-filter.js";

describe("buildReviewWhere", () => {
  it("scopes reviews to a single locale when requested", () => {
    assert.deepEqual(buildReviewWhere("entity-1", { locale: "en" }), {
      entityId: "entity-1",
      locale: "en",
      visibility: "ACTIVE"
    });
  });

  it("returns all active reviews when locale is all", () => {
    assert.deepEqual(buildReviewWhere("entity-1", { locale: "all" }), {
      entityId: "entity-1",
      visibility: "ACTIVE"
    });
  });

  it("defaults to all locales when filter is omitted", () => {
    assert.deepEqual(buildReviewWhere("entity-1"), {
      entityId: "entity-1",
      visibility: "ACTIVE"
    });
  });
});
