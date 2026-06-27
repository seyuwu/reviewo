import type { ExtensionReview } from "./types/review.js";

export function resolveMyReviewText(
  reviews: ExtensionReview[],
  currentUserId: string | undefined,
  myReviewFromApi?: ExtensionReview | null
): string {
  if (myReviewFromApi?.text) {
    return myReviewFromApi.text;
  }

  if (!currentUserId) {
    return "";
  }

  return reviews.find((review) => review.authorId === currentUserId)?.text ?? "";
}

export function reviewsExcludingAuthor(
  reviews: ExtensionReview[],
  authorId: string | undefined
): ExtensionReview[] {
  if (!authorId) {
    return reviews;
  }

  return reviews.filter((review) => review.authorId !== authorId);
}

export function hasSavedReviewText(text: string): boolean {
  return text.trim().length > 0;
}
