import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { calculateContributionBadges } from "../constants/contribution-badge.js";
import { ContributionScoreCalculator } from "./contribution-score-calculator.service.js";

describe("ContributionScoreCalculator", () => {
  const calculator = new ContributionScoreCalculator();

  it("sums base points for recognition events", () => {
    const score = calculator.calculate([
      {
        actionType: "top.forked",
        createdAt: new Date("2026-07-10T10:00:00.000Z")
      },
      {
        actionType: "top.liked",
        createdAt: new Date("2026-07-10T11:00:00.000Z")
      }
    ]);

    assert.equal(score, 60);
  });

  it("applies diminishing returns for repeated ratings on the same day", () => {
    const events = Array.from({ length: 25 }, (_, index) => ({
      actionType: "rating.created",
      createdAt: new Date(`2026-07-10T${String(10 + (index % 10)).padStart(2, "0")}:00:00.000Z`)
    }));

    const score = calculator.calculate(events);

    assert.equal(score, 23);
  });

  it("returns per-action breakdown with diminishing points", () => {
    const breakdown = calculator.calculateBreakdown([
      {
        actionType: "top.forked",
        createdAt: new Date("2026-07-10T10:00:00.000Z")
      },
      {
        actionType: "top.liked",
        createdAt: new Date("2026-07-10T11:00:00.000Z")
      },
      {
        actionType: "rating.created",
        createdAt: new Date("2026-07-10T12:00:00.000Z")
      }
    ]);

    assert.equal(breakdown.total, 61);
    assert.equal(breakdown.byActionType["top.forked"]?.points, 50);
    assert.equal(breakdown.byActionType["top.liked"]?.points, 10);
    assert.equal(breakdown.byActionType["rating.created"]?.rawCount, 1);
  });
});

describe("calculateContributionBadges", () => {
  it("awards milestone badges from snapshot counts", () => {
    const badges = calculateContributionBadges({
      battleVotesCount: 12,
      discussionsCount: 6,
      entitiesCreatedCount: 2,
      fieldFixesCount: 7,
      forksReceivedCount: 1,
      level: "pioneer",
      likesReceivedCount: 0,
      ratingsCount: 12,
      reviewsCount: 4,
      topsCount: 2
    });

    assert.ok(badges.includes("first_steps"));
    assert.ok(badges.includes("rater"));
    assert.ok(badges.includes("reviewer"));
    assert.ok(badges.includes("recognized_curator"));
    assert.ok(badges.includes("pioneer"));
  });
});
