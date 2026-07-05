import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCompareSlug } from "@reviewo/shared";

import { assertDiscoveryLimit } from "./discovery.service.js";

describe("assertDiscoveryLimit", () => {
  it("returns fallback when limit is undefined", () => {
    assert.equal(assertDiscoveryLimit(undefined, 12), 12);
  });

  it("rejects invalid limits", () => {
    assert.throws(() => assertDiscoveryLimit(21, 12));
    assert.throws(() => assertDiscoveryLimit(-1, 12));
    assert.throws(() => assertDiscoveryLimit(1.5, 12));
  });
});

describe("buildCompareSlug for discovery pairs", () => {
  it("builds stable pair slug", () => {
    assert.equal(buildCompareSlug("youtube", "github-com"), "youtube-vs-github-com");
  });
});
