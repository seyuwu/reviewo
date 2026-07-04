import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { UrlNormalizer } from "../interfaces/url-normalizer.js";
import {
  rankSearchResults,
  type SearchEntityMetrics,
  type SearchRankableEntity
} from "./search-ranking.js";
import { UrlNormalizationService } from "./url-normalization.service.js";

const urlNormalizer: UrlNormalizer = new UrlNormalizationService();

const rootId = "11111111-1111-4111-8111-111111111111";
const shortsId = "22222222-2222-4222-8222-222222222222";
const musicId = "33333333-3333-4333-8333-333333333333";
const partialId = "44444444-4444-4444-8444-444444444444";

function createEntity(overrides: Partial<SearchRankableEntity> = {}): SearchRankableEntity {
  return {
    canonicalUrl: "https://youtube.com/",
    id: rootId,
    parentId: null,
    title: "YouTube",
    ...overrides
  };
}

function createMetrics(
  overrides: Partial<SearchEntityMetrics> = {}
): SearchEntityMetrics {
  return {
    avgScore: null,
    reviewsCount: 0,
    votesCount: 0,
    ...overrides
  };
}

describe("rankSearchResults", () => {
  it("pins youtube.com root first even when child entities have more votes", () => {
    const root = createEntity();
    const shorts = createEntity({
      canonicalUrl: "https://youtube.com/shorts",
      id: shortsId,
      parentId: rootId,
      title: "YouTube Shorts"
    });
    const music = createEntity({
      canonicalUrl: "https://music.youtube.com/",
      id: musicId,
      parentId: rootId,
      title: "YouTube Music"
    });
    const metrics = new Map<string, SearchEntityMetrics>([
      [rootId, createMetrics()],
      [shortsId, createMetrics({ avgScore: 4.8, reviewsCount: 10, votesCount: 5000 })],
      [musicId, createMetrics({ avgScore: 4.5, reviewsCount: 5, votesCount: 3000 })]
    ]);

    const ranked = rankSearchResults(
      [shorts, music, root],
      "youtube",
      metrics,
      urlNormalizer,
      () => null
    );

    assert.equal(ranked[0]?.id, rootId);
    assert.equal(ranked[0]?.resultKind, "canonical_site");
    assert.equal(ranked[0]?.votesCount, 0);
    assert.equal(ranked[1]?.id, shortsId);
    assert.equal(ranked[2]?.id, musicId);
  });

  it("ranks exact title matches above partial matches", () => {
    const exact = createEntity({
      canonicalUrl: null,
      id: rootId,
      title: "YouTube"
    });
    const partial = createEntity({
      canonicalUrl: null,
      id: partialId,
      title: "YouTube Shorts Archive"
    });
    const metrics = new Map<string, SearchEntityMetrics>([
      [rootId, createMetrics({ votesCount: 1 })],
      [partialId, createMetrics({ votesCount: 9999 })]
    ]);

    const ranked = rankSearchResults(
      [partial, exact],
      "YouTube",
      metrics,
      urlNormalizer,
      () => null
    );

    assert.equal(ranked[0]?.id, rootId);
    assert.equal(ranked[1]?.id, partialId);
  });

  it("sorts children by popularity after the canonical root", () => {
    const root = createEntity();
    const premium = createEntity({
      canonicalUrl: "https://youtube.com/premium",
      id: musicId,
      parentId: rootId,
      title: "YouTube Premium"
    });
    const shorts = createEntity({
      canonicalUrl: "https://youtube.com/shorts",
      id: shortsId,
      parentId: rootId,
      title: "YouTube Shorts"
    });
    const metrics = new Map<string, SearchEntityMetrics>([
      [rootId, createMetrics()],
      [musicId, createMetrics({ votesCount: 100 })],
      [shortsId, createMetrics({ avgScore: 4.7, votesCount: 500 })]
    ]);

    const ranked = rankSearchResults(
      [root, premium, shorts],
      "youtube",
      metrics,
      urlNormalizer,
      () => null
    );

    assert.equal(ranked[0]?.id, rootId);
    assert.equal(ranked[1]?.id, shortsId);
    assert.equal(ranked[2]?.id, musicId);
  });

  it("treats youtube.com query as exact domain match", () => {
    const root = createEntity();
    const metrics = new Map<string, SearchEntityMetrics>([[rootId, createMetrics()]]);

    const ranked = rankSearchResults([root], "youtube.com", metrics, urlNormalizer, () => null);

    assert.equal(ranked[0]?.resultKind, "canonical_site");
  });

  it("prepends canonical root from lookup when it is missing from text search results", () => {
    const root = createEntity();
    const shorts = createEntity({
      canonicalUrl: "https://youtube.com/shorts",
      id: shortsId,
      parentId: rootId,
      title: "YouTube Shorts"
    });
    const metrics = new Map<string, SearchEntityMetrics>([
      [rootId, createMetrics()],
      [shortsId, createMetrics({ votesCount: 9000 })]
    ]);

    const ranked = rankSearchResults(
      [shorts],
      "youtube",
      metrics,
      urlNormalizer,
      (canonicalUrl) => (canonicalUrl === "https://youtube.com/" ? root : null)
    );

    assert.equal(ranked.length, 2);
    assert.equal(ranked[0]?.id, rootId);
    assert.equal(ranked[0]?.resultKind, "canonical_site");
  });
});
