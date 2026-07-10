import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ContributionLevelCalculator } from "./contribution-level-calculator.service.js";

describe("ContributionLevelCalculator", () => {
  const calculator = new ContributionLevelCalculator();
  const now = new Date("2026-07-10T00:00:00.000Z");

  it("returns newcomer for empty activity", () => {
    assert.equal(
      calculator.calculate(
        {
          battleVotesCount: 0,
          discussionsCount: 0,
          entitiesCreatedCount: 0,
          fieldFixesCount: 0,
          lastActivityAt: now,
          ratingsCount: 0,
          reviewsCount: 0,
          topsCount: 0
        },
        now
      ),
      "newcomer"
    );
  });

  it("promotes to contributor when thresholds are met", () => {
    assert.equal(
      calculator.calculate(
        {
          battleVotesCount: 0,
          discussionsCount: 0,
          entitiesCreatedCount: 0,
          fieldFixesCount: 0,
          lastActivityAt: now,
          ratingsCount: 10,
          reviewsCount: 0,
          topsCount: 0
        },
        now
      ),
      "contributor"
    );
  });

  it("decays level after inactivity", () => {
    const stale = new Date("2026-01-01T00:00:00.000Z");

    assert.equal(
      calculator.calculate(
        {
          battleVotesCount: 0,
          discussionsCount: 0,
          entitiesCreatedCount: 0,
          fieldFixesCount: 0,
          lastActivityAt: stale,
          ratingsCount: 50,
          reviewsCount: 0,
          topsCount: 0
        },
        now
      ),
      "contributor"
    );
  });
});
