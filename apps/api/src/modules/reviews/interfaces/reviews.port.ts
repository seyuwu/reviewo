import type { ReviewDto } from "../dto/review.dto.js";

export const REVIEWS_PORT = Symbol("REVIEWS_PORT");

export interface ReviewsPort {
  listReviewsForEntity(entityId: string, currentUserId?: string): Promise<ReviewDto[]>;
}
