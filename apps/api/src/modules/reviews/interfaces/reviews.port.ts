import type { ReviewDto } from "../dto/review.dto.js";

export const REVIEWS_PORT = Symbol("REVIEWS_PORT");

export interface ReviewsPort {
  getReviewCountForEntity(entityId: string): Promise<number>;
  listTopReviewsForEntity(entityId: string, limit: number): Promise<ReviewDto[]>;
  listReviewsForEntity(entityId: string, currentUserId?: string): Promise<ReviewDto[]>;
}
