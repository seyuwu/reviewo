import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  calculateEntityTrustScores,
  resolveReliabilityLevel
} from "./entity-trust-scores-calculator.service.js";

describe("entity-trust-scores-calculator", () => {
  it("maps confidence score to reliability levels", () => {
    assert.equal(resolveReliabilityLevel(0.97), "very_high");
    assert.equal(resolveReliabilityLevel(0.85), "high");
    assert.equal(resolveReliabilityLevel(0.65), "medium");
    assert.equal(resolveReliabilityLevel(0.4), "low");
  });

  it("returns higher manipulation risk when hard caps apply", () => {
    const result = calculateEntityTrustScores({
      confidenceScore: 0.45,
      factors: {
        anomalyFactor: 0.2,
        anomalyScore: 0.8,
        appliedHardCaps: ["ANOMALY", "UNIQUE_RATIO"],
        durationFactor: 0.5,
        massFactor: 0.9,
        uniqueRatio: 0.1,
        uniqueRatioFactor: 0.1,
        uniqueUsersFactor: 0.8,
        varianceFactor: 0.7
      }
    });

    assert.ok(result.manipulationRisk > 0.5);
    assert.ok(result.dataReliability > 0.4);
    assert.equal(result.reliabilityLevel, "low");
  });
});
