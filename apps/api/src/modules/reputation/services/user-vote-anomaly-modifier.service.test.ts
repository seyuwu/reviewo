import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { UserVoteAnomalyModifierService } from "./user-vote-anomaly-modifier.service.js";

describe("UserVoteAnomalyModifierService", () => {
  const service = new UserVoteAnomalyModifierService();

  it("returns neutral modifier when no signals fire", () => {
    const result = service.calculate({
      accountAgeDays: 30,
      entityBurstRatingsLastHour: 2,
      entityNewAccountClusterScore: 0.1,
      isInSyncWindow: false
    });

    assert.equal(result.modifier, 1);
    assert.equal(result.appliedSignals.length, 0);
  });

  it("reduces modifier for new-account cluster activity", () => {
    const result = service.calculate({
      accountAgeDays: 2,
      entityBurstRatingsLastHour: 1,
      entityNewAccountClusterScore: 0.8,
      isInSyncWindow: false
    });

    assert.equal(result.modifier, 0.35);
    assert.deepEqual(result.appliedSignals, ["NEW_ACCOUNT_CLUSTER"]);
  });

  it("reduces modifier for sync-window ratings", () => {
    const result = service.calculate({
      accountAgeDays: 30,
      entityBurstRatingsLastHour: 1,
      entityNewAccountClusterScore: 0,
      isInSyncWindow: true
    });

    assert.equal(result.modifier, 0.3);
    assert.deepEqual(result.appliedSignals, ["SYNC_WINDOW"]);
  });

  it("reduces modifier for entity burst activity", () => {
    const result = service.calculate({
      accountAgeDays: 30,
      entityBurstRatingsLastHour: 15,
      entityNewAccountClusterScore: 0,
      isInSyncWindow: false
    });

    assert.equal(result.modifier, 0.5);
    assert.deepEqual(result.appliedSignals, ["ENTITY_BURST"]);
  });

  it("uses the strongest penalty when multiple signals fire", () => {
    const result = service.calculate({
      accountAgeDays: 1,
      entityBurstRatingsLastHour: 20,
      entityNewAccountClusterScore: 0.9,
      isInSyncWindow: true,
      userCoordinationScore: 0.8
    });

    assert.equal(result.modifier, 0.2);
    assert.ok(result.appliedSignals.includes("COORDINATION_CLUSTER"));
  });
});
