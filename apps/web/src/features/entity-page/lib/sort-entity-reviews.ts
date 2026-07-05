import type { Review } from "../types/entity-page";

export type EntityReviewSort = "likes" | "newest";

export function sortEntityReviews(reviews: Review[], sort: EntityReviewSort): Review[] {
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
