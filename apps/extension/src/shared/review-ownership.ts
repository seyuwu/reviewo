export function isReviewByCurrentUser(review: { isOwnReview: boolean }): boolean {
  return review.isOwnReview;
}
