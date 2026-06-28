import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EntityConfidenceCalculator } from "./entity-confidence-calculator.service.js";

describe("EntityConfidenceCalculator", () => {
  const calculator = new EntityConfidenceCalculator();

  it("returns low confidence for sparse entities", () => {
    const result = calculator.calculate({
      activityDurationDays: 0,
      anomalyScore: 0,
      effectiveVoteMass: 1,
      scoreVariance: 0,
      uniqueRatersCount: 1
    });

    assert.ok(result.confidenceScore < 0.25);
    assert.ok(result.explanation.length >= 4);
  });

  it("returns high confidence for mature entities with low anomaly", () => {
    const result = calculator.calculate({
      activityDurationDays: 730,
      anomalyScore: 0.05,
      effectiveVoteMass: 120,
      scoreVariance: 0.4,
      uniqueRatersCount: 80
    });

    assert.ok(result.confidenceScore > 0.8);
    assert.equal(
      result.explanation.some((reason) => reason.code === "LOW_ANOMALY"),
      true
    );
  });
});
