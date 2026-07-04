import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AnomalyDetectionService } from "./anomaly-detection.service.js";

describe("AnomalyDetectionService", () => {
  const service = new AnomalyDetectionService();

  it("detects burst ratings", () => {
    const result = service.detect({
      ratingsLastHour: 25,
      syncClusterCount: 0
    });

    assert.equal(result.burstScore, 1);
    assert.equal(result.anomalyScore, 1);
  });

  it("combines sync and cluster signals", () => {
    const result = service.detect({
      clusterScore: 0.5,
      ratingsLastHour: 2,
      syncClusterCount: 2
    });

    assert.ok(result.syncScore > 0.5);
    assert.ok(result.anomalyScore >= result.syncScore * 0.8);
  });

  it("uses new-account cluster signals as entity anomaly input", () => {
    const result = service.detect({
      newAccountClusterScore: 0.9,
      ratingsLastHour: 2,
      syncClusterCount: 0
    });

    assert.equal(result.clusterScore, 0.9);
    assert.ok(result.anomalyScore >= 0.54);
  });

  it("uses coordination cluster signals as entity anomaly input", () => {
    const result = service.detect({
      coordinationClusterScore: 0.8,
      ratingsLastHour: 1,
      syncClusterCount: 0
    });

    assert.equal(result.clusterScore, 0.8);
    assert.ok(result.anomalyScore >= 0.48);
  });
});
