import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { AppException } from "../../../common/exceptions/app.exception.js";
import {
  sortRankedEntities,
  type SystemTopRankedEntityRow
} from "../repositories/system-tops.repository.js";
import { SystemTopsService } from "./system-tops.service.js";

function isAppExceptionWithCode(error: unknown, code: AppErrorCode): error is AppException {
  return error instanceof AppException && error.getErrorResponse().code === code;
}

describe("sortRankedEntities", () => {
  const rows: SystemTopRankedEntityRow[] = [
    {
      avgScore: 9,
      entityId: "11111111-1111-4111-8111-111111111111",
      reliability: 0.8,
      score: 10,
      slug: "low-votes-high-score",
      title: "Low votes",
      votesCount: 2
    },
    {
      avgScore: 8,
      entityId: "22222222-2222-4222-8222-222222222222",
      reliability: 0.9,
      score: 40,
      slug: "high-votes",
      title: "High votes",
      votesCount: 20
    }
  ];

  it("orders composite score descending", () => {
    const sorted = sortRankedEntities(rows, "composite");

    assert.equal(sorted[0]?.entityId, "22222222-2222-4222-8222-222222222222");
    assert.equal(sorted[1]?.entityId, "11111111-1111-4111-8111-111111111111");
  });

  it("orders votes descending", () => {
    const sorted = sortRankedEntities(rows, "votes");

    assert.equal(sorted[0]?.votesCount, 20);
    assert.equal(sorted[1]?.votesCount, 2);
  });
});

describe("SystemTopsService.getSystemTopBySlug", () => {
  it("throws NotFound for unknown slug", async () => {
    const service = new SystemTopsService(
      {
        findEntityById: async () => null
      } as never,
      {
        getAggregate: async () => {
          throw new Error("not used");
        }
      } as never,
      {
        computeRankedEntities: async () => [],
        getLatestComputedAtBySlug: async () => new Map(),
        getLatestSnapshot: async () => null,
        insertSnapshot: async () => {
          throw new Error("not used");
        },
        listEntitySystemTopAppearances: async () => []
      } as never
    );

    await assert.rejects(
      () => service.getSystemTopBySlug("unknown-slug"),
      (error: unknown) => isAppExceptionWithCode(error, AppErrorCode.NotFound)
    );
  });
});
