import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  levenshteinSimilarity,
  scoreTransliteratedTitleMatch,
  slugPrefixForDuplicateSearch,
  titleSlugKey
} from "./title-duplicate-match.js";

describe("title-duplicate-match", () => {
  it("maps latin and cyrillic spellings to the same slug key", () => {
    assert.equal(titleSlugKey("ronaldo"), "ronaldo");
    assert.equal(titleSlugKey("роналдо"), "ronaldo");
  });

  it("detects typo variants with high transliterated similarity", () => {
    const match = scoreTransliteratedTitleMatch("роналдо", "роналду");

    assert.equal(match.reason, "transliterated_title_similarity");
    assert.ok(match.similarity >= 0.85);
    assert.ok(match.score >= 0.75);
  });

  it("builds a slug prefix for near-duplicate candidate search", () => {
    assert.equal(slugPrefixForDuplicateSearch("ronaldu"), "ronald");
    assert.equal(slugPrefixForDuplicateSearch("abc"), null);
  });

  it("scores exact transliterated matches", () => {
    const match = scoreTransliteratedTitleMatch("ronaldo", "Роналдо");

    assert.equal(match.reason, "transliterated_title_match");
    assert.equal(match.score, 0.5);
    assert.ok(levenshteinSimilarity("ronaldo", "ronaldu") >= 0.85);
  });
});
