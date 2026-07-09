import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { AppException } from "../../../common/exceptions/app.exception.js";
import {
  assertValidTopSlug,
  resolveCreateRankMode,
  resolveUpdateRankMode,
  validateAndNormalizeTopItems
} from "./tops.service.js";
import { TopRankMode, TopSystemSortKey } from "#prisma/client";

function isAppExceptionWithCode(error: unknown, code: AppErrorCode): error is AppException {
  return error instanceof AppException && error.getErrorResponse().code === code;
}

describe("assertValidTopSlug", () => {
  it("rejects system- prefix", () => {
    assert.throws(
      () => {
        assertValidTopSlug("system-ai-tools");
      },
      (error: unknown) => isAppExceptionWithCode(error, AppErrorCode.ValidationError)
    );
  });

  it("rejects registered system top slugs", () => {
    assert.throws(
      () => {
        assertValidTopSlug("ai-tools");
      },
      (error: unknown) => isAppExceptionWithCode(error, AppErrorCode.ValidationError)
    );
  });

  it("allows regular slugs", () => {
    assert.doesNotThrow(() => {
      assertValidTopSlug("best-ai-for-devs");
    });
  });
});

describe("validateAndNormalizeTopItems", () => {
  const baseItems = [
    { entityId: "11111111-1111-4111-8111-111111111111" },
    { entityId: "22222222-2222-4222-8222-222222222222" },
    { entityId: "33333333-3333-4333-8333-333333333333" }
  ];

  it("accepts valid item count", () => {
    const result = validateAndNormalizeTopItems({ items: baseItems });

    assert.equal(result.length, 3);
  });

  it("rejects duplicate entity ids", () => {
    assert.throws(
      () => {
        validateAndNormalizeTopItems({
          items: [
            baseItems[0]!,
            baseItems[0]!,
            baseItems[1]!
          ]
        });
      },
      (error: unknown) => isAppExceptionWithCode(error, AppErrorCode.ValidationError)
    );
  });

  it("rejects too few items", () => {
    assert.throws(
      () => {
        validateAndNormalizeTopItems({ items: baseItems.slice(0, 2) });
      },
      (error: unknown) => isAppExceptionWithCode(error, AppErrorCode.ValidationError)
    );
  });
});

describe("resolveCreateRankMode", () => {
  it("defaults to MANUAL without systemSortKey", () => {
    const result = resolveCreateRankMode({});

    assert.equal(result.rankMode, TopRankMode.MANUAL);
    assert.equal(result.systemSortKey, null);
  });

  it("defaults HYBRID to RELIABILITY sort key", () => {
    const result = resolveCreateRankMode({ rankMode: TopRankMode.HYBRID });

    assert.equal(result.rankMode, TopRankMode.HYBRID);
    assert.equal(result.systemSortKey, TopSystemSortKey.RELIABILITY);
  });

  it("defaults SYSTEM to RELIABILITY sort key", () => {
    const result = resolveCreateRankMode({ rankMode: TopRankMode.SYSTEM });

    assert.equal(result.rankMode, TopRankMode.SYSTEM);
    assert.equal(result.systemSortKey, TopSystemSortKey.RELIABILITY);
  });
});

describe("resolveUpdateRankMode", () => {
  it("clears systemSortKey when switching to MANUAL", () => {
    const patch = resolveUpdateRankMode(
      { rankMode: TopRankMode.HYBRID, systemSortKey: TopSystemSortKey.RATING },
      { rankMode: TopRankMode.MANUAL }
    );

    assert.equal(patch.rankMode, TopRankMode.MANUAL);
    assert.equal(patch.systemSortKey, null);
  });

  it("defaults systemSortKey when switching to HYBRID", () => {
    const patch = resolveUpdateRankMode(
      { rankMode: TopRankMode.MANUAL, systemSortKey: null },
      { rankMode: TopRankMode.HYBRID }
    );

    assert.equal(patch.rankMode, TopRankMode.HYBRID);
    assert.equal(patch.systemSortKey, TopSystemSortKey.RELIABILITY);
  });

  it("defaults systemSortKey when switching to SYSTEM", () => {
    const patch = resolveUpdateRankMode(
      { rankMode: TopRankMode.MANUAL, systemSortKey: null },
      { rankMode: TopRankMode.SYSTEM }
    );

    assert.equal(patch.rankMode, TopRankMode.SYSTEM);
    assert.equal(patch.systemSortKey, TopSystemSortKey.RELIABILITY);
  });

  it("clears systemSortKey when switching SYSTEM to MANUAL", () => {
    const patch = resolveUpdateRankMode(
      { rankMode: TopRankMode.SYSTEM, systemSortKey: TopSystemSortKey.RATING },
      { rankMode: TopRankMode.MANUAL }
    );

    assert.equal(patch.rankMode, TopRankMode.MANUAL);
    assert.equal(patch.systemSortKey, null);
  });
});
