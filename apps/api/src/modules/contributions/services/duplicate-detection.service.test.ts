import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EntityType, EntityVisibility } from "#prisma/client";

import { scoreDuplicatePair } from "./duplicate-detection.service.js";

function createEntity(overrides: Partial<{
  canonicalUrl: string | null;
  id: string;
  slug: string;
  title: string;
}>): {
  canonicalUrl: string | null;
  createdAt: Date;
  createdBy: string | null;
  description: string | null;
  id: string;
  logoUrl: string | null;
  parentId: string | null;
  slug: string;
  title: string;
  type: EntityType;
  updatedAt: Date;
  visibility: EntityVisibility;
} {
  return {
    canonicalUrl: overrides.canonicalUrl ?? null,
    createdAt: new Date(),
    createdBy: null,
    description: null,
    id: overrides.id ?? "entity-id",
    logoUrl: null,
    parentId: null,
    slug: overrides.slug ?? "entity-slug",
    title: overrides.title ?? "Entity",
    type: EntityType.website,
    updatedAt: new Date(),
    visibility: EntityVisibility.ACTIVE
  };
}

describe("scoreDuplicatePair", () => {
  it("scores highly when title and canonical URL align", () => {
    const left = createEntity({
      canonicalUrl: "https://youtube.com",
      id: "left",
      slug: "youtube-com",
      title: "YouTube"
    });
    const right = createEntity({
      canonicalUrl: "https://youtube.com",
      id: "right",
      slug: "youtube",
      title: "YouTube"
    });

    const result = scoreDuplicatePair(left, right);

    assert.ok(result.matchPercent >= 70);
    assert.ok(result.reasons.includes("title_match"));
    assert.ok(result.reasons.includes("canonical_url_match"));
  });

  it("scores partial match for title-only stub", () => {
    const left = createEntity({
      canonicalUrl: "https://youtube.com",
      id: "left",
      slug: "youtube-com",
      title: "YouTube"
    });
    const right = createEntity({
      canonicalUrl: null,
      id: "right",
      slug: "youtube",
      title: "YouTube"
    });

    const result = scoreDuplicatePair(left, right);

    assert.equal(result.matchPercent, 50);
    assert.ok(result.reasons.includes("title_match"));
  });

  it("scores episode-style duplicates with partial titles", () => {
    const left = createEntity({
      canonicalUrl: "https://youtube.com/watch?v=w5quSaKh3ic",
      id: "left",
      slug: "youtube-com-watch-v-w5qusakh3ic",
      title: "Кухня | Сезон 3 | Серия 51"
    });
    const right = createEntity({
      canonicalUrl: null,
      id: "right",
      slug: "kukhnya-51-seriya",
      title: "кухня 51 серия"
    });

    const result = scoreDuplicatePair(left, right);

    assert.ok(result.matchPercent >= 70);
    assert.ok(result.reasons.includes("title_tokens_subset"));
  });

  it("scores latin and cyrillic title variants", () => {
    const left = createEntity({
      id: "left",
      slug: "ronaldo",
      title: "ronaldo"
    });
    const right = createEntity({
      id: "right",
      slug: "ronaldo",
      title: "Роналдо"
    });

    const result = scoreDuplicatePair(left, right);

    assert.ok(result.matchPercent >= 70);
    assert.ok(result.reasons.includes("transliterated_title_match"));
    assert.ok(result.reasons.includes("slug_match"));
  });

  it("scores short typo variants in cyrillic titles", () => {
    const left = createEntity({
      id: "left",
      slug: "ronaldo",
      title: "роналдо"
    });
    const right = createEntity({
      id: "right",
      slug: "ronaldu",
      title: "роналду"
    });

    const result = scoreDuplicatePair(left, right);

    assert.ok(result.matchPercent >= 70);
    assert.ok(result.reasons.includes("transliterated_title_similarity"));
  });
});
