import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import type { RateEntityDto } from "../dto/rate-entity.dto.js";
import type { RatingAggregateDto } from "../dto/rating-aggregate.dto.js";
import type { RateEntityResponseDto } from "../dto/rating-response.dto.js";

export const RATINGS_PORT = Symbol("RATINGS_PORT");

export interface RatingsPort {
  getAggregate(entityId: string): Promise<RatingAggregateDto>;
  rateEntity(
    entityId: string,
    input: RateEntityDto,
    currentUser: AuthenticatedUser
  ): Promise<RateEntityResponseDto>;
}
