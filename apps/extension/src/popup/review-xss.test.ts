import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TranslateFn } from "@reviewo/i18n";

import { renderEntityReviewsSectionMarkup } from "./entity-reviews-section.js";
import type { ExtensionReview } from "./types/review.js";

const t: TranslateFn = (key) => key;
const maliciousReviewText = `<img src=x onerror="alert(1)">`;

const popupReview: ExtensionReview = {
  createdAt: "2026-06-27T00:00:00.000Z",
  entityId: "entity-1",
  id: "review-1",
  isOwnReview: false,
  likedByCurrentUser: false,
  likesCount: 0,
  locale: "en",
  text: maliciousReviewText,
  updatedAt: "2026-06-27T00:00:00.000Z"
};

describe("review HTML renderers", () => {
  it("escapes review text in the popup review section", () => {
    const markup = renderEntityReviewsSectionMarkup(
      t,
      {
        contentLocale: "en",
        displayMode: "full",
        isAuthenticated: false,
        reviews: [popupReview],
        reviewsLimit: 10,
        showAllReviews: false,
        sort: "likes"
      },
      ""
    );

    assert.equal(markup.includes("<img"), false);
    assert.ok(markup.includes("&lt;img"));
  });
});
