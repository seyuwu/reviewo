import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EntityType } from "@prisma/client";

import type { ReputationReadRepository } from "../repositories/reputation-read.repository.js";
import type { ReputationRepository } from "../repositories/reputation.repository.js";
import { AnomalyDetectionService } from "./anomaly-detection.service.js";
import { EntityConfidenceCalculator } from "./entity-confidence-calculator.service.js";
import { ReputationCalculationContext } from "./reputation-calculation-context.service.js";
import { ReputationService } from "./reputation.service.js";
import { UserTrustCalculator } from "./user-trust-calculator.service.js";
import { VoteWeightCalculator } from "./vote-weight-calculator.service.js";

const userId = "11111111-1111-4111-8111-111111111111";
const entityId = "22222222-2222-4222-8222-222222222222";
const ratingId = "33333333-3333-4333-8333-333333333333";

interface StoredSnapshot {
  calculationVersion: number;
  entityId: string;
  ratingId: string;
  score: number;
  userId: string;
  voteWeight: number;
}

function createReputationServiceHarness() {
  const snapshots = new Map<string, StoredSnapshot>();
  const appendEventCalls: string[] = [];
  const userHourlyActivity = {
    ratingCreatedCount: 0,
    ratingUpdatedCount: 0
  };
  let entityActivityHourlyIncrements = 0;

  const reputationRepository = {
    appendReputationEvent: async ({ type }: { type: string }) => {
      appendEventCalls.push(type);
      return { id: "event-id" };
    },
    applyRatingToUserBehaviorMetrics: async () => ({ totalRatings: 1 }),
    countDistinctRatersInWindow: async () => 1,
    countUserEntityTypePairs: async () => 1,
    getEntityAnomalyMetrics: async () => null,
    getUserBehaviorMetrics: async () => ({
      score1Count: 0,
      score2Count: 0,
      score3Count: 1,
      score4Count: 0,
      score5Count: 0,
      totalRatings: 1,
      uniqueEntityCount: 1,
      uniqueEntityTypeCount: 1,
      uniqueRootDomainCount: 1
    }),
    getEntityActivityHourlyCount: async () => entityActivityHourlyIncrements,
    incrementEntityActivityHourly: async () => {
      entityActivityHourlyIncrements += 1;

      return entityActivityHourlyIncrements;
    },
    incrementUserActivityDaily: async () => undefined,
    incrementUserActivityHourly: async (input: {
      createdIncrement?: number;
      updatedIncrement?: number;
    }) => {
      userHourlyActivity.ratingCreatedCount += input.createdIncrement ?? 0;
      userHourlyActivity.ratingUpdatedCount += input.updatedIncrement ?? 0;
    },
    incrementUserEntityStats: async () => ({ isNewEntity: true }),
    incrementUserEntityTypeStats: async () => ({ isNewPair: true }),
    incrementUserRootDomainStats: async () => ({ isNewDomain: true }),
    listTopUserEntityRatingCounts: async () => [1],
    listUserActivityDaily: async () => [1],
    listUserActivityHourly: async () => [userHourlyActivity],
    resolveParentContextType: async () => "__root__",
    sumVoteWeightsForEntity: async () => {
      const values = [...snapshots.values()].filter((snapshot) => snapshot.entityId === entityId);

      return values.reduce((sum, snapshot) => sum + snapshot.voteWeight, 0);
    },
    updateRatingScoreInBehaviorMetrics: async () => undefined,
    upsertEntityAnomalyMetrics: async () => ({ anomalyScore: 0 }),
    upsertEntityConfidenceProfile: async (input: { calculationVersion: number }) => ({
      calculationVersion: input.calculationVersion
    }),
    upsertUserTrustProfile: async (input: { calculationVersion: number; trustScore: number }) => ({
      calculationVersion: input.calculationVersion,
      trustScore: input.trustScore
    }),
    upsertVoteWeightSnapshot: async (input: StoredSnapshot) => {
      snapshots.set(input.ratingId, input);
      return input;
    }
  } as unknown as ReputationRepository;

  const readRepository = {
    countDistinctRatersInWindow: async () => 1,
    findEntityById: async () => ({
      canonicalUrl: "https://example.com",
      id: entityId,
      parentId: null,
      type: EntityType.website
    }),
    findUserById: async () => ({
      createdAt: new Date("2024-01-01T00:00:00.000Z")
    }),
    getAuthorReviewModerationStats: async () => ({
      hiddenReviewsCount: 0,
      reviewsCount: 0
    }),
    getNewAccountRatingCohortStats: async () => ({
      averageAccountAgeDays: null,
      dominantScoreShare: 0,
      ratingsCount: 0
    }),
    getEntityRatingStats: async () => ({
      firstRatingAt: new Date("2026-06-01T00:00:00.000Z"),
      lastRatingAt: new Date("2026-06-02T00:00:00.000Z"),
      scores: [3, 5],
      uniqueRatersCount: 1
    })
  } as unknown as ReputationReadRepository;

  const calculationContext = new ReputationCalculationContext();
  const service = new ReputationService(
    new AnomalyDetectionService(),
    calculationContext,
    new EntityConfidenceCalculator(),
    readRepository,
    reputationRepository,
    new UserTrustCalculator(),
    new VoteWeightCalculator()
  );

  return {
    appendEventCalls,
    calculationContext,
    getEntityActivityHourlyIncrements: () => entityActivityHourlyIncrements,
    getUserHourlyActivity: () => userHourlyActivity,
    service,
    snapshots
  };
}

describe("ReputationService vote weight snapshots", () => {
  it("keeps exactly one VoteWeightSnapshot per ratingId when score changes", async () => {
    const harness = createReputationServiceHarness();
    const payload = {
      entityId,
      ratingId,
      score: 3,
      userId
    };

    await harness.service.onRatingCreated(payload);
    await harness.service.onRatingUpdated(payload, 3, new Date(), { skipEventAppend: true });
    await harness.service.onRatingUpdated({ ...payload, score: 5 }, 3);

    assert.equal(harness.snapshots.size, 1);

    const snapshot = harness.snapshots.get(ratingId);

    assert.ok(snapshot);
    assert.equal(snapshot.score, 5);
    assert.equal(snapshot.ratingId, ratingId);
  });

  it("replaces vote weight instead of accumulating old weights for the same rating", async () => {
    const harness = createReputationServiceHarness();

    await harness.service.onRatingCreated({
      entityId,
      ratingId,
      score: 3,
      userId
    });

    await harness.service.onRatingUpdated(
      {
        entityId,
        ratingId,
        score: 5,
        userId
      },
      3
    );

    const snapshot = harness.snapshots.get(ratingId);

    assert.equal(harness.snapshots.size, 1);
    assert.ok(snapshot);
    assert.equal(snapshot.score, 5);
  });

  it("does not count rating score updates as new entity activity", async () => {
    const harness = createReputationServiceHarness();

    await harness.service.onRatingCreated({
      entityId,
      ratingId,
      score: 3,
      userId
    });
    await harness.service.onRatingUpdated(
      {
        entityId,
        ratingId,
        score: 5,
        userId
      },
      3
    );
    await harness.service.onRatingUpdated(
      {
        entityId,
        ratingId,
        score: 2,
        userId
      },
      5
    );

    assert.equal(harness.getEntityActivityHourlyIncrements(), 1);
  });

  it("counts rating score updates as user edit churn", async () => {
    const harness = createReputationServiceHarness();

    await harness.service.onRatingCreated({
      entityId,
      ratingId,
      score: 3,
      userId
    });
    await harness.service.onRatingUpdated(
      {
        entityId,
        ratingId,
        score: 5,
        userId
      },
      3
    );

    assert.deepEqual(harness.getUserHourlyActivity(), {
      ratingCreatedCount: 1,
      ratingUpdatedCount: 1
    });
  });
});
