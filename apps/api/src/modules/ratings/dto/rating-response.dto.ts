import { RatingAggregateDto } from "./rating-aggregate.dto.js";

export class UserRatingDto {
  createdAt!: string;
  entityId!: string;
  score!: number;
  source!: string;
  updatedAt!: string;
  userId!: string;
}

export class RateEntityResponseDto {
  aggregate!: RatingAggregateDto;
  rating!: UserRatingDto;
}
