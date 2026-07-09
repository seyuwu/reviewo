import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TopSystemSortKey } from "#prisma/client";

import type { PrismaService } from "../../../database/prisma.service.js";
import { USER_TOP_MIN_VOTES } from "../constants/top-limits.js";
import { UserTopRankService } from "./user-top-rank.service.js";

describe("UserTopRankService", () => {
  it("ranks eligible entities and marks low-vote entities as insufficient_data", async () => {
    const entityIds = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333"
    ];

    const prismaService = {
      $queryRaw: async () => [
        {
          avgScore: 3,
          entityId: entityIds[0],
          reliability: 0.8,
          score: 3,
          slug: "low-rated",
          title: "Low Rated",
          votesCount: USER_TOP_MIN_VOTES
        },
        {
          avgScore: 5,
          entityId: entityIds[1],
          reliability: 0.9,
          score: 5,
          slug: "top-rated",
          title: "Top Rated",
          votesCount: 10
        },
        {
          avgScore: 4,
          entityId: entityIds[2],
          reliability: 0.85,
          score: 4,
          slug: "mid-rated",
          title: "Mid Rated",
          votesCount: 2
        }
      ]
    } as unknown as PrismaService;

    const service = new UserTopRankService(prismaService);
    const rankings = await service.computeRankings(entityIds, TopSystemSortKey.RATING);

    assert.equal(rankings.get(entityIds[0]!)?.systemPosition, 2);
    assert.equal(rankings.get(entityIds[1]!)?.systemPosition, 1);
    assert.equal(rankings.get(entityIds[2]!)?.status, "insufficient_data");
    assert.equal(rankings.get(entityIds[2]!)?.systemPosition, undefined);
  });

  it("returns empty map for empty entity set", async () => {
    const prismaService = {
      $queryRaw: async () => {
        throw new Error("should not query database for empty input");
      }
    } as unknown as PrismaService;

    const service = new UserTopRankService(prismaService);
    const rankings = await service.computeRankings([], TopSystemSortKey.RELIABILITY);

    assert.equal(rankings.size, 0);
  });
});
