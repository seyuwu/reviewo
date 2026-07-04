import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { VoteWeightCalculator } from "./vote-weight-calculator.service.js";

describe("VoteWeightCalculator", () => {
  const calculator = new VoteWeightCalculator();

  it("returns user trust as vote weight", () => {
    const result = calculator.calculate({
      anomalyModifier: 1,
      entityId: "entity-id",
      userId: "user-id",
      userTrust: 0.83
    });

    assert.equal(result.weight, 0.83);
    assert.deepEqual(result.factors, {
      anomalyModifier: 1,
      userTrust: 0.83
    });
  });

  it("applies anomaly modifier to vote weight", () => {
    const result = calculator.calculate({
      anomalyModifier: 0.5,
      entityId: "entity-id",
      userId: "user-id",
      userTrust: 0.8
    });

    assert.equal(result.weight, 0.4);
    assert.deepEqual(result.factors, {
      anomalyModifier: 0.5,
      userTrust: 0.8
    });
  });

  it("clamps vote weight to minimum 0.05", () => {
    const result = calculator.calculate({
      anomalyModifier: 1,
      entityId: "entity-id",
      userId: "user-id",
      userTrust: 0.01
    });

    assert.equal(result.weight, 0.05);
  });

  it("clamps vote weight to maximum 1", () => {
    const result = calculator.calculate({
      anomalyModifier: 1,
      entityId: "entity-id",
      userId: "user-id",
      userTrust: 1.5
    });

    assert.equal(result.weight, 1);
  });
});
