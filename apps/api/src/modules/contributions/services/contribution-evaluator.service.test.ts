import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ContributionType } from "#prisma/client";
import type { ContributionPolicy } from "#prisma/client";

import { ContributionEvaluatorService } from "./contribution-evaluator.service.js";

describe("ContributionEvaluatorService", () => {
  const service = new ContributionEvaluatorService();

  const basePolicy = {
    activityScale: false,
    baseApproveWeight: 2,
    baseRejectWeight: 2,
    cooldownHours: 0,
    minUniqueVoters: 2,
    tier: "AUTO" as const,
    type: ContributionType.UPDATE_URL
  } as unknown as ContributionPolicy;

  it("applies stub URL attach at low threshold", () => {
    const outcome = service.evaluate({
      payload: { newValue: "https://youtube.com", oldValue: null },
      policy: basePolicy,
      tier: "AUTO",
      totals: {
        approvalsWeight: 2,
        rejectionsWeight: 0,
        uniqueApprovers: 2,
        uniqueRejecters: 0
      },
      type: ContributionType.UPDATE_URL,
      votesCount: 0
    });

    assert.equal(outcome.action, "apply");
  });

  it("requires higher threshold for URL change on active entity", () => {
    const outcome = service.evaluate({
      payload: { newValue: "https://youtube.com", oldValue: "https://youtu.be" },
      policy: basePolicy,
      tier: "AUTO",
      totals: {
        approvalsWeight: 3,
        rejectionsWeight: 0,
        uniqueApprovers: 3,
        uniqueRejecters: 0
      },
      type: ContributionType.UPDATE_URL,
      votesCount: 10
    });

    assert.equal(outcome.action, "none");
  });

  it("never auto-applies moderation tier", () => {
    const outcome = service.evaluate({
      payload: {
        reason: "Same website",
        sourceEntityId: "a",
        targetEntityId: "b"
      },
      policy: {
        ...basePolicy,
        tier: "MODERATION"
      },
      tier: "MODERATION",
      totals: {
        approvalsWeight: 10,
        rejectionsWeight: 0,
        uniqueApprovers: 10,
        uniqueRejecters: 0
      },
      type: ContributionType.MERGE_ENTITY,
      votesCount: 100
    });

    assert.equal(outcome.action, "none");
  });
});
