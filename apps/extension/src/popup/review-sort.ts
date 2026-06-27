import type { ExtensionReview, ExtensionReviewSort } from "./types/review.js";

export function sortEntityReviews(
  reviews: ExtensionReview[],
  sort: ExtensionReviewSort
): ExtensionReview[] {
  const copy = [...reviews];

  if (sort === "newest") {
    return copy.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  }

  return copy.sort((left, right) => {
    if (right.likesCount !== left.likesCount) {
      return right.likesCount - left.likesCount;
    }

    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  });
}
