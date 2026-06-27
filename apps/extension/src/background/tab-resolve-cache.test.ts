import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  cacheTabResolveResult,
  doesCachedResolveMatchPageUrl,
  getCachedTabResolveResult,
  patchCachedResolveWithRating,
  resetTabResolveCacheForTests
} from "./tab-resolve-cache.js";
import type { ExtensionQuickRatingResponse } from "../shared/types/quick-rating.js";

const quickRating: ExtensionQuickRatingResponse = {
  entity: {
    canonicalUrl: "https://example.com/page",
    description: null,
    id: "11111111-1111-4111-8111-111111111111",
    slug: "example-com-page",
    title: "Example Page",
    type: "website"
  },
  myRating: {
    createdAt: "2026-06-27T00:00:00.000Z",
    entityId: "11111111-1111-4111-8111-111111111111",
    score: 4,
    source: "web",
    updatedAt: "2026-06-27T00:00:00.000Z",
    userId: "22222222-2222-4222-8222-222222222222"
  },
  rating: {
    avgScore: 4,
    entityId: "11111111-1111-4111-8111-111111111111",
    updatedAt: "2026-06-27T00:00:00.000Z",
    votesCount: 1
  },
  trust: {
    confidence: 0.1
  },
  web: {
    entityPagePath: "/entities/11111111-1111-4111-8111-111111111111"
  }
};

describe("doesCachedResolveMatchPageUrl", () => {
  it("matches the same page identity and rejects a different YouTube page", () => {
    const result = {
      entity: {
        canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        description: null,
        id: "11111111-1111-4111-8111-111111111111",
        slug: "youtube-video",
        title: "Never Gonna Give You Up",
        type: "video"
      },
      rating: {
        avgScore: 4.5,
        entityId: "11111111-1111-4111-8111-111111111111",
        updatedAt: "2026-06-27T00:00:00.000Z",
        votesCount: 10
      },
      status: "found" as const,
      trust: {
        confidence: 0.5
      },
      url: {
        canonical: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        input: "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
      },
      web: {
        entityPagePath: "/entities/11111111-1111-4111-8111-111111111111"
      }
    };

    assert.equal(
      doesCachedResolveMatchPageUrl(result, "https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
      true
    );
    assert.equal(doesCachedResolveMatchPageUrl(result, "https://www.youtube.com/"), false);
  });
});

describe("patchCachedResolveWithRating", () => {
  afterEach(() => {
    resetTabResolveCacheForTests();
  });

  it("promotes a cached not_found resolve result to found after rating", () => {
    cacheTabResolveResult(7, {
      canCreateEntity: true,
      status: "not_found",
      url: {
        canonical: "https://example.com/page",
        input: "https://example.com/page"
      }
    });

    patchCachedResolveWithRating(
      quickRating.entity.id,
      quickRating,
      "https://example.com/page"
    );

    const updated = getCachedTabResolveResult(7);

    assert.equal(updated?.status, "found");

    if (updated?.status === "found") {
      assert.equal(updated.entity.title, "Example Page");
      assert.equal(updated.rating.votesCount, 1);
    }
  });
});
