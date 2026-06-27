import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatReviewLengthCounter,
  isReviewTextWithinLimit,
  MAX_REVIEW_TEXT_LENGTH,
  reviewLengthCounterClass
} from "./review-limits.js";

describe("review-limits", () => {
  it("formats the character counter", () => {
    assert.equal(formatReviewLengthCounter(42), `42 / ${MAX_REVIEW_TEXT_LENGTH}`);
  });

  it("accepts non-empty text within the limit", () => {
    assert.equal(isReviewTextWithinLimit("hello"), true);
    assert.equal(isReviewTextWithinLimit("x".repeat(MAX_REVIEW_TEXT_LENGTH)), true);
  });

  it("rejects empty or over-limit text", () => {
    assert.equal(isReviewTextWithinLimit(""), false);
    assert.equal(isReviewTextWithinLimit("x".repeat(MAX_REVIEW_TEXT_LENGTH + 1)), false);
  });

  it("marks near-limit and at-limit counters", () => {
    assert.equal(reviewLengthCounterClass(100), "");
    assert.equal(reviewLengthCounterClass(MAX_REVIEW_TEXT_LENGTH - 1), "review-length-counter--near-limit");
    assert.equal(reviewLengthCounterClass(MAX_REVIEW_TEXT_LENGTH), "review-length-counter--at-limit");
  });
});
