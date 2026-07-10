import type { EntityDto } from "../../entities/dto/entity.dto.js";
import type { RatingAggregateDto } from "../../ratings/dto/rating-aggregate.dto.js";
import type { ReviewDto } from "../../reviews/dto/review.dto.js";
import type { TrustConfidenceDto } from "../../trust/dto/trust-confidence.dto.js";
import type { EntityPageParentSummaryDto } from "./entity-page-parent-summary.dto.js";
import type { EntityPageRelatedPresenceDto } from "./entity-page-related-presence.dto.js";

export class EntityPageMetaDto {
  reviewsCount!: number;
  reviewsCountGlobal!: number;
}

export class EntityPageResponseDto {
  entity!: EntityDto;
  meta!: EntityPageMetaDto;
  parent?: EntityPageParentSummaryDto;
  relatedPresences!: EntityPageRelatedPresenceDto[];
  rating!: RatingAggregateDto;
  reviews!: ReviewDto[];
  trust!: TrustConfidenceDto;
}
