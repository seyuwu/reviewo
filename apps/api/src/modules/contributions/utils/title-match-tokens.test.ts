import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computeTitleTokenOverlap,
  extractTitleTokens,
  pickTitleSearchTokens
} from "./title-match-tokens.js";

describe("title-match-tokens", () => {
  it("extracts meaningful tokens from episode-style titles", () => {
    assert.deepEqual(extractTitleTokens("Кухня | Сезон 3 | Серия 51"), [
      "кухня",
      "сезон",
      "серия",
      "51"
    ]);
    assert.deepEqual(extractTitleTokens("кухня 51 серия"), ["кухня", "51", "серия"]);
  });

  it("detects strong overlap for episode duplicates", () => {
    const overlap = computeTitleTokenOverlap(
      "Кухня | Сезон 3 | Серия 51",
      "кухня 51 серия"
    );

    assert.equal(overlap.shorterCoverage, 1);
    assert.equal(overlap.shorterTokenCount, 3);
    assert.ok(overlap.jaccard >= 0.7);
  });

  it("limits search tokens to the most specific ones", () => {
    const tokens = pickTitleSearchTokens("Alpha Beta Gamma Delta Epsilon Zeta Eta");

    assert.equal(tokens.length, 5);
    assert.equal(tokens[0], "epsilon");
  });
});
