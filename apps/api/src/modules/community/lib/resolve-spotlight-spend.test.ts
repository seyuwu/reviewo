import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveSpotlightDurationHours, resolveSpotlightSpend } from "./resolve-spotlight-spend.js";

describe("resolveSpotlightSpend", () => {
  it("defaults to minimum spend for placement type", () => {
    const resolved = resolveSpotlightSpend("entity_spotlight");

    assert.equal(resolved.cost, 10);
    assert.equal(resolved.durationMs, 20 * 3_600_000);
  });

  it("uses two hours per credit", () => {
    assert.equal(resolveSpotlightDurationHours(10), 20);
    assert.equal(resolveSpotlightDurationHours(25), 50);
  });

  it("rejects spends below the minimum", () => {
    assert.throws(() => resolveSpotlightSpend("entity_spotlight", 9));
  });

  it("rejects spends above the per-request maximum", () => {
    assert.throws(() => resolveSpotlightSpend("entity_spotlight", 201));
  });
});
