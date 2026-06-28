import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { UserTrustCalculator } from "./user-trust-calculator.service.js";

describe("UserTrustCalculator", () => {
  const calculator = new UserTrustCalculator();
  const accountCreatedAt = new Date("2024-01-01T00:00:00.000Z");
  const now = new Date("2026-06-28T00:00:00.000Z");

  it("returns neutral scores for new users", () => {
    const result = calculator.calculate(
      {
        accountCreatedAt,
        anomalyPenalty: 0,
        dailyRatingCounts: [],
        entityRatingCounts: [],
        scoreCounts: [0, 0, 0, 0, 0],
        totalRatings: 0,
        uniqueEntityTypeCount: 0,
        uniqueRootDomainCount: 0,
        uniqueTypeParentPairCount: 0
      },
      now
    );

    assert.equal(result.diversityScore, 0.5);
    assert.equal(result.stabilityScore, 0.5);
    assert.equal(result.consensusScore, 0.5);
    assert.ok(result.trustScore >= 0.05);
  });

  it("rewards diverse entity activity", () => {
    const result = calculator.calculate(
      {
        accountCreatedAt,
        anomalyPenalty: 0,
        dailyRatingCounts: [1, 1, 1, 1, 1],
        entityRatingCounts: [1, 1, 1, 1, 1],
        scoreCounts: [1, 1, 1, 1, 1],
        totalRatings: 5,
        uniqueEntityTypeCount: 4,
        uniqueRootDomainCount: 3,
        uniqueTypeParentPairCount: 6
      },
      now
    );

    assert.ok(result.diversityScore >= 0.8);
    assert.ok(result.coverageScore > 0.5);
    assert.ok(result.trustScore > 0.5);
  });

  it("penalizes burst activity in stability score", () => {
    const result = calculator.calculate(
      {
        accountCreatedAt,
        anomalyPenalty: 0,
        dailyRatingCounts: [100, 0, 0],
        entityRatingCounts: [50, 50],
        scoreCounts: [20, 20, 20, 20, 20],
        totalRatings: 100,
        uniqueEntityTypeCount: 2,
        uniqueRootDomainCount: 1,
        uniqueTypeParentPairCount: 2
      },
      now
    );

    assert.ok(result.stabilityScore < 0.5);
  });
});
