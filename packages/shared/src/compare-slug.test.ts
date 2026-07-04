import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildCompareSlug, buildPairKey, parseCompareSlug } from "./compare-slug.js";

describe("parseCompareSlug", () => {
  it("parses simple pair slugs", () => {
    assert.deepEqual(parseCompareSlug("steam-vs-epic"), {
      leftSlug: "steam",
      rightSlug: "epic"
    });
  });

  it("parses slugs with hyphens on the right side", () => {
    assert.deepEqual(parseCompareSlug("spotify-vs-youtube-music"), {
      leftSlug: "spotify",
      rightSlug: "youtube-music"
    });
  });

  it("returns null for invalid slugs", () => {
    assert.equal(parseCompareSlug("steam"), null);
    assert.equal(parseCompareSlug("-vs-epic"), null);
    assert.equal(parseCompareSlug("steam-vs-"), null);
  });
});

describe("buildCompareSlug", () => {
  it("builds normalized pair slugs", () => {
    assert.equal(buildCompareSlug("Steam", "Epic"), "steam-vs-epic");
  });
});

describe("buildPairKey", () => {
  it("builds stable pair keys", () => {
    assert.equal(
      buildPairKey("b", "a"),
      buildPairKey("a", "b")
    );
  });
});
