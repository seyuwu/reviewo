import type { RatingAggregateDto } from "../dto/rating-aggregate.dto.js";

export const RATINGS_PORT = Symbol("RATINGS_PORT");

export interface RatingsPort {
  getAggregate(entityId: string): Promise<RatingAggregateDto>;
}
