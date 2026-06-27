/** Matches `UpsertReviewDto` max length in the API. */
export const MAX_REVIEW_TEXT_LENGTH = 5000;

export const REVIEW_LENGTH_WARNING_THRESHOLD = MAX_REVIEW_TEXT_LENGTH - 200;

export function formatReviewLengthCounter(length: number): string {
  return `${length} / ${MAX_REVIEW_TEXT_LENGTH}`;
}

export function isReviewTextWithinLimit(text: string): boolean {
  return text.length > 0 && text.length <= MAX_REVIEW_TEXT_LENGTH;
}

export function reviewLengthCounterClass(length: number): string {
  if (length >= MAX_REVIEW_TEXT_LENGTH) {
    return "review-length-counter--at-limit";
  }

  if (length >= REVIEW_LENGTH_WARNING_THRESHOLD) {
    return "review-length-counter--near-limit";
  }

  return "";
}
