import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { calculateHerfindahlIndex, calculateVariance, clamp } from "./reputation-math.js";
import { extractRootDomain } from "./root-domain.js";

describe("reputation math utilities", () => {
  it("calculates variance for score sets", () => {
    assert.equal(calculateVariance([3, 3, 3]), 0);
    assert.ok(calculateVariance([1, 5]) > 0);
  });

  it("calculates Herfindahl index", () => {
    assert.equal(calculateHerfindahlIndex([50, 50]), 0.5);
    assert.ok(Math.abs(calculateHerfindahlIndex([1, 1, 1]) - 1 / 3) < 0.001);
  });

  it("clamps values", () => {
    assert.equal(clamp(2, 0.05, 1), 1);
    assert.equal(clamp(0, 0.05, 1), 0.05);
  });
});

describe("extractRootDomain", () => {
  it("normalizes hostname and strips www", () => {
    assert.equal(extractRootDomain("https://www.youtube.com/watch?v=abc"), "youtube.com");
    assert.equal(extractRootDomain("https://github.com/org/repo"), "github.com");
  });

  it("returns null for invalid urls", () => {
    assert.equal(extractRootDomain(null), null);
    assert.equal(extractRootDomain("not-a-url"), null);
  });
});
