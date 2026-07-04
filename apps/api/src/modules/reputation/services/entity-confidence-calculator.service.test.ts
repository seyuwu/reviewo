import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EntityConfidenceCalculator } from "./entity-confidence-calculator.service.js";
import { HARD_CAP_UNIQUE_RATIO } from "../utils/entity-confidence-hard-caps.js";

describe("EntityConfidenceCalculator", () => {
  const calculator = new EntityConfidenceCalculator();

  it("returns low confidence for sparse entities", () => {
    const result = calculator.calculate({
      activityDurationDays: 0,
      anomalyScore: 0,
      effectiveVoteMass: 1,
      scoreVariance: 0,
      uniqueRatersCount: 1,
      votesCount: 10
    });

    assert.ok(result.confidenceScore < 0.35);
    assert.ok(result.appliedHardCaps.includes("UNIQUE_RATIO"));
    assert.ok(result.explanation.some((reason) => reason.code === "UNIQUE_RATIO"));
  });

  it("returns high confidence for mature entities with low anomaly", () => {
    const result = calculator.calculate({
      activityDurationDays: 730,
      anomalyScore: 0.05,
      effectiveVoteMass: 120,
      scoreVariance: 0.4,
      uniqueRatersCount: 80,
      votesCount: 100
    });

    assert.ok(result.confidenceScore > 0.8);
    assert.equal(
      result.explanation.some((reason) => reason.code === "LOW_ANOMALY"),
      true
    );
  });

  it("caps confidence when many votes come from few users", () => {
    const result = calculator.calculate({
      activityDurationDays: 365,
      anomalyScore: 0,
      effectiveVoteMass: 120,
      scoreVariance: 0.2,
      uniqueRatersCount: 5,
      votesCount: 100
    });

    assert.ok(result.confidenceScore <= HARD_CAP_UNIQUE_RATIO);
    assert.ok(result.appliedHardCaps.includes("UNIQUE_RATIO"));
  });

  it("caps confidence when anomaly score is elevated", () => {
    const result = calculator.calculate({
      activityDurationDays: 365,
      anomalyScore: 0.85,
      effectiveVoteMass: 120,
      scoreVariance: 0.2,
      uniqueRatersCount: 80,
      votesCount: 100
    });

    assert.ok(result.confidenceScore <= 0.4);
    assert.ok(result.appliedHardCaps.includes("ANOMALY"));
  });
});
