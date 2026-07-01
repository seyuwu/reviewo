import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Rating } from "#prisma/client";

import type { ReputationRepository } from "../repositories/reputation.repository.js";
import { ReputationBackfillService } from "./reputation-backfill.service.js";
import type { ReputationService } from "./reputation.service.js";

const rating: Rating = {
  createdAt: new Date("2026-06-01T10:00:00.000Z"),
  entityId: "22222222-2222-4222-8222-222222222222",
  id: "33333333-3333-4333-8333-333333333333",
  score: 4,
  source: "web",
  updatedAt: new Date("2026-06-01T10:00:00.000Z"),
  userId: "11111111-1111-4111-8111-111111111111"
};

describe("ReputationBackfillService", () => {
  it("skips rating when event handler already created VoteWeightSnapshot", async () => {
    let onRatingCreatedCalls = 0;
    const repository = {
      getVoteWeightSnapshotByRatingId: async () => ({
        calculationVersion: 1,
        createdAt: new Date(),
        entityId: rating.entityId,
        id: "snapshot-id",
        ratingId: rating.id,
        score: rating.score,
        userId: rating.userId,
        voteWeight: 0.8,
        weightFactors: { userTrust: 0.8 }
      })
    } as unknown as ReputationRepository;
    const service = {
      onRatingCreated: async () => {
        onRatingCreatedCalls += 1;
      }
    } as unknown as ReputationService;
    const backfillService = new ReputationBackfillService(repository, service);

    const result = await backfillService.processRating(rating);

    assert.equal(result, "skipped");
    assert.equal(onRatingCreatedCalls, 0);
  });

  it("processes rating when no VoteWeightSnapshot exists yet", async () => {
    let onRatingCreatedCalls = 0;
    const repository = {
      getVoteWeightSnapshotByRatingId: async () => null
    } as unknown as ReputationRepository;
    const service = {
      onRatingCreated: async () => {
        onRatingCreatedCalls += 1;
      }
    } as unknown as ReputationService;
    const backfillService = new ReputationBackfillService(repository, service);

    const result = await backfillService.processRating(rating);

    assert.equal(result, "processed");
    assert.equal(onRatingCreatedCalls, 1);
  });

  it("simulates concurrent backfill after live rating.created without duplicating work", async () => {
    const snapshots = new Set<string>();
    let behaviorMetricIncrements = 0;

    const repository = {
      getVoteWeightSnapshotByRatingId: async (ratingId: string) =>
        snapshots.has(ratingId)
          ? {
              calculationVersion: 1,
              createdAt: new Date(),
              entityId: rating.entityId,
              id: "snapshot-id",
              ratingId,
              score: rating.score,
              userId: rating.userId,
              voteWeight: 0.8,
              weightFactors: { userTrust: 0.8 }
            }
          : null
    } as unknown as ReputationRepository;

    const service = {
      onRatingCreated: async (payload: { ratingId: string }) => {
        behaviorMetricIncrements += 1;
        snapshots.add(payload.ratingId);
      }
    } as unknown as ReputationService;

    const backfillService = new ReputationBackfillService(repository, service);

    await service.onRatingCreated({
      entityId: rating.entityId,
      ratingId: rating.id,
      score: rating.score,
      userId: rating.userId
    });

    const backfillResult = await backfillService.processRating(rating);

    assert.equal(backfillResult, "skipped");
    assert.equal(behaviorMetricIncrements, 1);
    assert.equal(snapshots.size, 1);
  });
});
