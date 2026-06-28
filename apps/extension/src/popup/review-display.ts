import type { ExtensionReview } from "./types/review.js";

export function resolveMyReviewText(
  reviews: ExtensionReview[],
  myReviewFromApi?: ExtensionReview | null
): string {
  if (myReviewFromApi?.text) {
    return myReviewFromApi.text;
  }

  return reviews.find((review) => review.isOwnReview)?.text ?? "";
}

export function reviewsExcludingOwnReview(reviews: ExtensionReview[]): ExtensionReview[] {
  return reviews.filter((review) => !review.isOwnReview);
}

export function hasSavedReviewText(text: string): boolean {
  return text.trim().length > 0;
}
