import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PresenceService } from "./presence.service.js";

describe("PresenceService", () => {
  it("tracks online users in a sorted set and returns the count", async () => {
    const store = new Map<string, Map<string, number>>();
    const redisService = {
      getClient: async () => ({
        zAdd: async (key: string, entries: Array<{ score: number; value: string }>) => {
          const bucket = store.get(key) ?? new Map<string, number>();
          for (const entry of entries) {
            bucket.set(entry.value, entry.score);
          }
          store.set(key, bucket);
        },
        zCard: async (key: string) => store.get(key)?.size ?? 0,
        zRem: async (key: string, value: string) => {
          store.get(key)?.delete(value);
        },
        zRemRangeByScore: async (key: string, min: number, max: number) => {
          const bucket = store.get(key);

          if (!bucket) {
            return;
          }

          for (const [member, score] of bucket.entries()) {
            if (score >= min && score <= max) {
              bucket.delete(member);
            }
          }
        }
      })
    };

    const service = new PresenceService(redisService as never);
    const firstCount = await service.markOnline(entityId, "user-1");
    const secondCount = await service.markOnline(entityId, "user-2");

    assert.equal(firstCount, 1);
    assert.equal(secondCount, 2);
    assert.equal(await service.getOnlineCount(entityId), 2);

    const afterLeave = await service.markOffline(entityId, "user-1");

    assert.equal(afterLeave, 1);
  });
});

const entityId = "22222222-2222-4222-8222-222222222222";
