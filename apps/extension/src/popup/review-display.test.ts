import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  hasSavedReviewText,
  resolveMyReviewText,
  reviewsExcludingAuthor
} from "./review-display.js";
import type { ExtensionReview } from "./types/review.js";

const sampleReview = (overrides: Partial<ExtensionReview>): ExtensionReview => ({
  authorId: "user-1",
  createdAt: "2026-06-27T00:00:00.000Z",
  entityId: "entity-1",
  id: "review-1",
  likedByCurrentUser: false,
  likesCount: 0,
  text: "My review",
  updatedAt: "2026-06-27T00:00:00.000Z",
  ...overrides
});

describe("review-display", () => {
  it("prefers my-review API text over list fallback", () => {
    const reviews = [sampleReview({ text: "From list" })];

    assert.equal(
      resolveMyReviewText(reviews, "user-1", sampleReview({ text: "From API" })),
      "From API"
    );
  });

  it("falls back to the current user's review in the list", () => {
    const reviews = [sampleReview({ authorId: "user-1", text: "From list" })];

    assert.equal(resolveMyReviewText(reviews, "user-1", null), "From list");
  });

  it("hides the current user's review from the public list", () => {
    const reviews = [
      sampleReview({ authorId: "user-1", id: "mine" }),
      sampleReview({ authorId: "user-2", id: "theirs", text: "Other" })
    ];

    assert.deepEqual(
      reviewsExcludingAuthor(reviews, "user-1").map((review) => review.id),
      ["theirs"]
    );
  });

  it("detects saved review text", () => {
    assert.equal(hasSavedReviewText("hello"), true);
    assert.equal(hasSavedReviewText("   "), false);
  });
});
