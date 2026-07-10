import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sortEntityReviews } from "./review-sort.js";
import type { ExtensionReview } from "./types/review.js";

const reviews: ExtensionReview[] = [
  {
    createdAt: "2026-06-27T00:00:00.000Z",
    entityId: "e",
    id: "1",
    isOwnReview: false,
    likedByCurrentUser: false,
    likesCount: 2,
    locale: "en",
    text: "Older popular",
    updatedAt: "2026-06-20T00:00:00.000Z"
  },
  {
    createdAt: "2026-06-27T00:00:00.000Z",
    entityId: "e",
    id: "2",
    isOwnReview: false,
    likedByCurrentUser: false,
    likesCount: 5,
    locale: "en",
    text: "Top liked",
    updatedAt: "2026-06-25T00:00:00.000Z"
  },
  {
    createdAt: "2026-06-27T00:00:00.000Z",
    entityId: "e",
    id: "3",
    isOwnReview: false,
    likedByCurrentUser: false,
    likesCount: 1,
    locale: "en",
    text: "Newest",
    updatedAt: "2026-06-27T00:00:00.000Z"
  }
];

describe("sortEntityReviews", () => {
  it("sorts by likes count descending", () => {
    const sorted = sortEntityReviews(reviews, "likes");

    assert.deepEqual(
      sorted.map((review) => review.id),
      ["2", "1", "3"]
    );
  });

  it("sorts by newest update first", () => {
    const sorted = sortEntityReviews(reviews, "newest");

    assert.deepEqual(
      sorted.map((review) => review.id),
      ["3", "2", "1"]
    );
  });
});
