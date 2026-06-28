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
    assert.equal(result.anomalyPenalty, 0);
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

  it("penalizes high hourly rating velocity", () => {
    const steady = calculator.calculate(
      {
        accountCreatedAt,
        anomalyPenalty: 0,
        dailyRatingCounts: [8, 8, 8, 8],
        entityRatingCounts: Array.from({ length: 32 }, () => 1),
        hourlyRatingCounts: [4, 4, 4, 4, 4, 4, 4, 4],
        hourlyRatingUpdateCounts: [],
        ratingEditRatio: 0,
        scoreCounts: [6, 6, 8, 6, 6],
        totalRatings: 32,
        uniqueEntityTypeCount: 5,
        uniqueRootDomainCount: 5,
        uniqueTypeParentPairCount: 8
      },
      now
    );
    const bursty = calculator.calculate(
      {
        accountCreatedAt,
        anomalyPenalty: 0,
        dailyRatingCounts: [32],
        entityRatingCounts: Array.from({ length: 32 }, () => 1),
        hourlyRatingCounts: [32],
        hourlyRatingUpdateCounts: [],
        ratingEditRatio: 0,
        scoreCounts: [6, 6, 8, 6, 6],
        totalRatings: 32,
        uniqueEntityTypeCount: 5,
        uniqueRootDomainCount: 5,
        uniqueTypeParentPairCount: 8
      },
      now
    );

    assert.ok(bursty.anomalyPenalty > steady.anomalyPenalty);
    assert.ok(bursty.trustScore < steady.trustScore);
  });

  it("penalizes frequent rating edits", () => {
    const result = calculator.calculate(
      {
        accountCreatedAt,
        anomalyPenalty: 0,
        dailyRatingCounts: [10],
        entityRatingCounts: Array.from({ length: 10 }, () => 1),
        hourlyRatingCounts: [10],
        hourlyRatingUpdateCounts: [12],
        ratingEditRatio: 1.2,
        scoreCounts: [2, 2, 2, 2, 2],
        totalRatings: 10,
        uniqueEntityTypeCount: 5,
        uniqueRootDomainCount: 5,
        uniqueTypeParentPairCount: 8
      },
      now
    );

    assert.ok(result.anomalyPenalty > 0.05);
    assert.ok(result.trustScore < 0.8);
  });

  it("caps trust for brand-new accounts without blocking them", () => {
    const result = calculator.calculate(
      {
        accountCreatedAt: now,
        anomalyPenalty: 0,
        dailyRatingCounts: [1, 1, 1, 1, 1, 1, 1],
        entityRatingCounts: Array.from({ length: 20 }, () => 1),
        hourlyRatingCounts: [2, 2, 2],
        hourlyRatingUpdateCounts: [],
        ratingEditRatio: 0,
        scoreCounts: [4, 4, 4, 4, 4],
        totalRatings: 20,
        uniqueEntityTypeCount: 5,
        uniqueRootDomainCount: 5,
        uniqueTypeParentPairCount: 8
      },
      now
    );

    assert.ok(result.trustScore <= 0.55);
    assert.ok(result.trustScore >= 0.05);
  });

  it("softly penalizes repeated hidden reviews", () => {
    const result = calculator.calculate(
      {
        accountCreatedAt,
        anomalyPenalty: 0,
        dailyRatingCounts: [2, 2, 2, 2, 2],
        entityRatingCounts: Array.from({ length: 10 }, () => 1),
        hourlyRatingCounts: [2, 2, 2, 2, 2],
        hourlyRatingUpdateCounts: [],
        ratingEditRatio: 0,
        reviewModeration: {
          hiddenReviewsCount: 4,
          reviewsCount: 10
        },
        scoreCounts: [2, 2, 2, 2, 2],
        totalRatings: 10,
        uniqueEntityTypeCount: 5,
        uniqueRootDomainCount: 5,
        uniqueTypeParentPairCount: 8
      },
      now
    );

    assert.ok(result.anomalyPenalty > 0);
  });
});
