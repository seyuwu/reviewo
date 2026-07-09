import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TopCompositionService } from "./top-composition.service.js";
import type { TopsRepository } from "../repositories/tops.repository.js";

function createRepositoryStub(overrides: Partial<TopsRepository> = {}): TopsRepository {
  return {
    countActiveItems: async () => 0,
    findActiveTopIdsForEntities: async () => [],
    updateVisibility: async () => ({}),
    ...overrides
  } as TopsRepository;
}

describe("TopCompositionService", () => {
  it("hides active tops with fewer than three active items", async () => {
    const hiddenTopIds: string[] = [];
    const repository = createRepositoryStub({
      countActiveItems: async (topId) => (topId === "top-1" ? 2 : 4),
      findActiveTopIdsForEntities: async () => ["top-1", "top-2"],
      updateVisibility: async (topId, visibility) => {
        if (visibility === "HIDDEN") {
          hiddenTopIds.push(topId);
        }

        return { id: topId } as never;
      }
    });
    const service = new TopCompositionService(repository);

    await service.syncVisibilityForEntityIds(["entity-a", "entity-b"]);

    assert.deepEqual(hiddenTopIds, ["top-1"]);
  });

  it("does nothing when no entity ids are provided", async () => {
    let updateCalls = 0;
    const repository = createRepositoryStub({
      updateVisibility: async () => {
        updateCalls += 1;
        return { id: "top-1" } as never;
      }
    });
    const service = new TopCompositionService(repository);

    await service.syncVisibilityForEntityIds([]);

    assert.equal(updateCalls, 0);
  });
});
