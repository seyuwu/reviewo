import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { VoteWeightCalculator } from "./vote-weight-calculator.service.js";

describe("VoteWeightCalculator", () => {
  const calculator = new VoteWeightCalculator();

  it("returns user trust as vote weight in v1", () => {
    const result = calculator.calculate({
      entityId: "entity-id",
      userId: "user-id",
      userTrust: 0.83
    });

    assert.equal(result.weight, 0.83);
    assert.deepEqual(result.factors, {
      userTrust: 0.83
    });
  });

  it("clamps vote weight to minimum 0.05", () => {
    const result = calculator.calculate({
      entityId: "entity-id",
      userId: "user-id",
      userTrust: 0.01
    });

    assert.equal(result.weight, 0.05);
  });

  it("clamps vote weight to maximum 1", () => {
    const result = calculator.calculate({
      entityId: "entity-id",
      userId: "user-id",
      userTrust: 1.5
    });

    assert.equal(result.weight, 1);
  });
});
