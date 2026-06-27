import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeCardUiScale } from "./card-responsive-scale.js";

describe("computeCardUiScale", () => {
  it("returns 1 at the 1920x1080 reference viewport", () => {
    assert.equal(computeCardUiScale(1920, 1080), 1);
  });

  it("scales down proportionally on smaller viewports", () => {
    assert.equal(computeCardUiScale(1280, 720), 0.67);
    assert.equal(computeCardUiScale(960, 1080), 0.5);
  });

  it("scales up proportionally on larger viewports", () => {
    assert.equal(computeCardUiScale(2560, 1440), 1.33);
    assert.equal(computeCardUiScale(3840, 2160), 2);
  });
});
