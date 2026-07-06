import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiRateLimiterService, resolveRequestIp } from "./api-rate-limiter.service.js";
import {
  createEntityCreationRateLimitRules,
  createPresenceHeartbeatRateLimitRules,
  createReviewVoteRateLimitRules,
  createReviewWriteRateLimitRules,
  createTrustCheckRateLimitRules
} from "./write-rate-limit-rules.js";
import type { RedisService } from "../../redis/redis.service.js";

describe("ApiRateLimiterService", () => {
  it("allows requests until the configured limit is exceeded", async () => {
    const counts = new Map<string, number>();
    const expirations = new Map<string, number>();
    const redisService = {
      getClient: async () => ({
        expire: async (key: string, seconds: number) => {
          expirations.set(key, seconds);
        },
        incr: async (key: string) => {
          const next = (counts.get(key) ?? 0) + 1;
          counts.set(key, next);

          return next;
        },
        ttl: async (key: string) => expirations.get(key) ?? 60
      })
    } as unknown as RedisService;
    const limiter = new ApiRateLimiterService(redisService);
    const rule = {
      key: "user-id",
      limit: 2,
      message: "Too many requests",
      namespace: "test",
      windowSeconds: 60
    };

    await limiter.assertWithinLimits([rule]);
    await limiter.assertWithinLimits([rule]);

    await assert.rejects(() => limiter.assertWithinLimits([rule]), {
      message: "Too many requests"
    });
  });

  it("does not trust x-forwarded-for when resolving request IP", () => {
    assert.equal(
      resolveRequestIp({
        headers: {
          "x-forwarded-for": "203.0.113.1, 10.0.0.1"
        },
        ip: "127.0.0.1"
      }),
      "127.0.0.1"
    );
  });

  it("falls back to socket remote address when request IP is absent", () => {
    assert.equal(
      resolveRequestIp({
        socket: {
          remoteAddress: "198.51.100.10"
        }
      }),
      "198.51.100.10"
    );
  });

  it("keeps write endpoint limits scoped and soft", () => {
    const request = { ip: "127.0.0.1" };

    assert.deepEqual(
      createEntityCreationRateLimitRules("user-id", request).map(({ limit, namespace }) => ({
        limit,
        namespace
      })),
      [
        { limit: 20, namespace: "entities:create:user" },
        { limit: 60, namespace: "entities:create:ip" }
      ]
    );
    assert.deepEqual(
      createReviewWriteRateLimitRules("user-id", request).map(({ limit, namespace }) => ({
        limit,
        namespace
      })),
      [
        { limit: 20, namespace: "reviews:write:user" },
        { limit: 60, namespace: "reviews:write:ip" }
      ]
    );
    assert.deepEqual(
      createReviewVoteRateLimitRules("user-id", request).map(({ limit, namespace }) => ({
        limit,
        namespace
      })),
      [
        { limit: 120, namespace: "reviews:vote:user" },
        { limit: 300, namespace: "reviews:vote:ip" }
      ]
    );
    assert.deepEqual(
      createPresenceHeartbeatRateLimitRules("user-id", request).map(({ limit, namespace }) => ({
        limit,
        namespace
      })),
      [
        { limit: 180, namespace: "chat:presence:user" },
        { limit: 600, namespace: "chat:presence:ip" }
      ]
    );
    assert.deepEqual(
      createTrustCheckRateLimitRules(request).map(({ limit, namespace }) => ({
        limit,
        namespace
      })),
      [{ limit: 60, namespace: "trust-check:ip" }]
    );
  });
});
