import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  calculateJaccardOverlap,
  CoordinationGraphService
} from "./coordination-graph.service.js";

describe("CoordinationGraphService", () => {
  const service = new CoordinationGraphService();

  it("calculates jaccard overlap", () => {
    const overlap = calculateJaccardOverlap(
      new Set(["a", "b", "c", "d", "e"]),
      new Set(["a", "b", "c", "d", "f"])
    );

    assert.equal(overlap, 4 / 6);
  });

  it("detects coordinated user clusters", () => {
    const sharedEntities = ["e1", "e2", "e3", "e4", "e5", "e6"];
    const clusters = service.detectClusters(
      Array.from({ length: 5 }, (_, index) => ({
        entityIds: new Set(sharedEntities),
        userId: `user-${index + 1}`
      }))
    );

    assert.equal(clusters.length, 1);
    assert.equal(clusters[0]?.memberUserIds.length, 5);
    assert.equal(clusters[0]?.overlapScore, 1);
  });

  it("ignores independent users", () => {
    const clusters = service.detectClusters([
      {
        entityIds: new Set(["a", "b", "c", "d", "e"]),
        userId: "user-1"
      },
      {
        entityIds: new Set(["f", "g", "h", "i", "j"]),
        userId: "user-2"
      },
      {
        entityIds: new Set(["k", "l", "m", "n", "o"]),
        userId: "user-3"
      },
      {
        entityIds: new Set(["p", "q", "r", "s", "t"]),
        userId: "user-4"
      },
      {
        entityIds: new Set(["u", "v", "w", "x", "y"]),
        userId: "user-5"
      }
    ]);

    assert.equal(clusters.length, 0);
  });
});
