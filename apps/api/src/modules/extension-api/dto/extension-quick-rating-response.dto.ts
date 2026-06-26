import type { RatingAggregateDto } from "../../ratings/dto/rating-aggregate.dto.js";
import type { UserRatingDto } from "../../ratings/dto/rating-response.dto.js";
import type { TrustConfidenceDto } from "../../trust/dto/trust-confidence.dto.js";
import type { ExtensionEntitySummaryDto } from "./extension-resolve-response.dto.js";
import type { ExtensionWebLinkDto } from "./extension-resolve-response.dto.js";

export class ExtensionQuickRatingResponseDto {
  entity!: ExtensionEntitySummaryDto;
  myRating!: UserRatingDto;
  rating!: RatingAggregateDto;
  trust!: TrustConfidenceDto;
  web!: ExtensionWebLinkDto;
}
