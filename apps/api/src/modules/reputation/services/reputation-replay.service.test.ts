import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ReputationEvent } from "@prisma/client";

import type { ReputationRepository } from "../repositories/reputation.repository.js";
import { ReputationCalculationContext } from "./reputation-calculation-context.service.js";
import { ReputationReplayService } from "./reputation-replay.service.js";
import type { ReputationService } from "./reputation.service.js";

const userId = "11111111-1111-4111-8111-111111111111";
const entityId = "22222222-2222-4222-8222-222222222222";

function createRatingEvent(index: number, type: "rating.created" | "rating.updated"): ReputationEvent {
  const ratingId = `33333333-3333-4333-8333-${String(index).padStart(12, "0")}`;

  return {
    createdAt: new Date(`2026-06-01T10:${String(index % 60).padStart(2, "0")}:00.000Z`),
    entityId,
    id: `event-${index}`,
    payload: {
      entityId,
      occurredAt: new Date(`2026-06-01T10:${String(index % 60).padStart(2, "0")}:00.000Z`).toISOString(),
      ratingId,
      score: type === "rating.updated" ? 5 : 4,
      ...(type === "rating.updated" ? { previousScore: 4 } : {}),
      userId
    },
    ratingId,
    type,
    userId
  };
}

describe("ReputationReplayService", () => {
  it("replays 1000 rating events and stamps calculationVersion=2 on derived profiles", async () => {
    const events: ReputationEvent[] = [];

    for (let index = 0; index < 1000; index += 1) {
      events.push(createRatingEvent(index, "rating.created"));
    }

    let cleared = false;
    let replayedCreates = 0;
    const userTrustVersions: number[] = [];
    const entityConfidenceVersions: number[] = [];
    const snapshotVersions: number[] = [];
    const snapshots = new Map<string, { calculationVersion: number; score: number }>();

    const repository = {
      clearDerivedState: async () => {
        cleared = true;
        snapshots.clear();
      },
      getVoteWeightSnapshotByRatingId: async (ratingId: string) => snapshots.get(ratingId) ?? null,
      listReputationEventsOrdered: async () => events
    } as unknown as ReputationRepository;

    const calculationContext = new ReputationCalculationContext();
    const service = {
      onRatingCreated: async (
        payload: { ratingId: string; score: number },
        _occurredAt: Date,
        options?: { skipEventAppend?: boolean }
      ) => {
        replayedCreates += 1;
        assert.equal(options?.skipEventAppend, true);
        const version = calculationContext.getVersion();
        userTrustVersions.push(version);
        entityConfidenceVersions.push(version);
        snapshotVersions.push(version);
        snapshots.set(payload.ratingId, {
          calculationVersion: version,
          score: payload.score
        });
      },
      onRatingUpdated: async () => {
        throw new Error("not expected in this replay test");
      },
      onReviewCreated: async () => undefined,
      onReviewHidden: async () => undefined,
      onReviewUnhidden: async () => undefined
    } as unknown as ReputationService;

    const replayService = new ReputationReplayService(calculationContext, repository, service);

    calculationContext.setVersion(1);
    const firstPass = await replayService.replay();
    assert.equal(firstPass.replayedEvents, 1000);
    assert.equal(cleared, true);
    assert.ok(userTrustVersions.every((version) => version === 1));
    assert.ok(entityConfidenceVersions.every((version) => version === 1));
    assert.ok(snapshotVersions.every((version) => version === 1));

    calculationContext.setVersion(2);
    cleared = false;
    const replayedVersions: number[] = [];
    replayedCreates = 0;

    const serviceForSecondPass = {
      onRatingCreated: async (
        payload: { ratingId: string; score: number },
        _occurredAt: Date,
        options?: { skipEventAppend?: boolean }
      ) => {
        replayedCreates += 1;
        assert.equal(options?.skipEventAppend, true);
        const version = calculationContext.getVersion();
        replayedVersions.push(version);
        snapshots.set(payload.ratingId, {
          calculationVersion: version,
          score: payload.score
        });
      },
      onRatingUpdated: async () => {
        throw new Error("not expected in this replay test");
      },
      onReviewCreated: async () => undefined,
      onReviewHidden: async () => undefined,
      onReviewUnhidden: async () => undefined
    } as unknown as ReputationService;

    const replayServiceSecondPass = new ReputationReplayService(
      calculationContext,
      repository,
      serviceForSecondPass
    );

    const expectedVersionAfterReplay = 2;
    const secondPass = await replayServiceSecondPass.replay({
      calculationVersion: expectedVersionAfterReplay
    });

    assert.equal(secondPass.replayedEvents, 1000);
    assert.equal(cleared, true);
    assert.equal(replayedCreates, 1000);
    assert.ok(replayedVersions.every((version) => version === expectedVersionAfterReplay));
  });

  it("does not append duplicate ReputationEvent rows during replay", async () => {
    const events = [createRatingEvent(1, "rating.created")];
    let appendCalls = 0;

    const repository = {
      clearDerivedState: async () => undefined,
      getVoteWeightSnapshotByRatingId: async () => null,
      listReputationEventsOrdered: async () => events
    } as unknown as ReputationRepository;

    const calculationContext = new ReputationCalculationContext();
    const service = {
      onRatingCreated: async (
        _payload: unknown,
        _occurredAt: Date,
        options?: { skipEventAppend?: boolean }
      ) => {
        if (!options?.skipEventAppend) {
          appendCalls += 1;
        }
      },
      onRatingUpdated: async () => undefined,
      onReviewCreated: async () => undefined,
      onReviewHidden: async () => undefined,
      onReviewUnhidden: async () => undefined
    } as unknown as ReputationService;

    const replayService = new ReputationReplayService(calculationContext, repository, service);

    await replayService.replay({ calculationVersion: 2 });

    assert.equal(appendCalls, 0);
  });
});
