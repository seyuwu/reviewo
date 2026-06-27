import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatReviewSnippet } from "./review-snippet.js";

describe("formatReviewSnippet", () => {
  it("returns the first two sentences in compact mode", () => {
    assert.equal(
      formatReviewSnippet("First sentence. Second sentence. Third sentence."),
      "First sentence. Second sentence.…"
    );
  });

  it("keeps short reviews unchanged", () => {
    assert.equal(formatReviewSnippet("Short and useful."), "Short and useful.");
  });
});
