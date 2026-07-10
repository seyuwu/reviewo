import type { ReviewDto } from "../dto/review.dto.js";

export const REVIEWS_PORT = Symbol("REVIEWS_PORT");

export interface ReviewsPort {
  getReviewCountForEntity(entityId: string, localeInput?: string): Promise<number>;
  hideReview(reviewId: string): Promise<ReviewDto>;
  listTopReviewsForEntity(
    entityId: string,
    limit: number,
    currentUserId?: string,
    localeInput?: string
  ): Promise<ReviewDto[]>;
  listReviewsForEntity(
    entityId: string,
    currentUserId?: string,
    localeInput?: string
  ): Promise<ReviewDto[]>;
  unhideReview(reviewId: string): Promise<ReviewDto>;
}
