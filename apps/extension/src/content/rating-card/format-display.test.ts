import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTranslator } from "@reviewo/i18n";

import {
  buildRatingCardSummary,
  formatAverageScore,
  formatRatingReliability,
  formatRatingStatsLine,
  formatVotesCount
} from "./format-display.js";
import type { ExtensionResolveFoundResponse } from "../../shared/types/resolve.js";

describe("rating card display formatting", () => {
  const t = createTranslator("en");

  it("formats average score, votes, and reliability labels", () => {
    assert.equal(formatAverageScore(4.26), "4.3");
    assert.equal(formatVotesCount(t, 1), "1 rating");
    assert.equal(formatVotesCount(t, 3), "3 ratings");
    assert.equal(formatRatingReliability(t, 0.2), "Reliability 20%");
    assert.equal(formatRatingReliability(t, 0.42), "Reliability 42%");
    assert.equal(formatRatingReliability(t, 0.8), "Reliability 80%");
  });

  it("builds card summary from found resolve response", () => {
    const response = {
      entity: {
        canonicalUrl: "https://example.com/",
        description: null,
        id: "22222222-2222-4222-8222-222222222222",
        slug: "example",
        title: "Example",
        type: "website"
      },
      rating: {
        avgScore: 4.5,
        entityId: "22222222-2222-4222-8222-222222222222",
        updatedAt: "2026-06-27T00:00:00.000Z",
        votesCount: 2
      },
      status: "found",
      trust: {
        confidence: 0.02
      },
      url: {
        canonical: "https://example.com/",
        input: "https://example.com/"
      },
      web: {
        entityPagePath: "/entities/22222222-2222-4222-8222-222222222222"
      }
    } satisfies ExtensionResolveFoundResponse;

    const summary = buildRatingCardSummary(t, response);

    assert.equal(summary.entityTitle, "Example");
    assert.equal(summary.averageScoreLabel, "4.5");
    assert.equal(summary.metaLabel, "2 ratings · Reliability 2%");
  });

  it("builds empty-state summary when entity has no ratings", () => {
    const response = {
      entity: {
        canonicalUrl: "https://example.com/",
        description: null,
        id: "22222222-2222-4222-8222-222222222222",
        slug: "example",
        title: "Example",
        type: "website"
      },
      rating: {
        avgScore: 0,
        entityId: "22222222-2222-4222-8222-222222222222",
        updatedAt: "2026-06-27T00:00:00.000Z",
        votesCount: 0
      },
      status: "found",
      trust: {
        confidence: 0
      },
      url: {
        canonical: "https://example.com/",
        input: "https://example.com/"
      },
      web: {
        entityPagePath: "/entities/22222222-2222-4222-8222-222222222222"
      }
    } satisfies ExtensionResolveFoundResponse;

    const summary = buildRatingCardSummary(t, response);

    assert.equal(summary.hasRatings, false);
    assert.equal(summary.averageScoreLabel, "—");
    assert.equal(summary.metaLabel, "No ratings yet · Be the first to rate");
    assert.equal(formatRatingStatsLine(t, 0, 0), "No ratings yet · Be the first to rate");
  });
});
