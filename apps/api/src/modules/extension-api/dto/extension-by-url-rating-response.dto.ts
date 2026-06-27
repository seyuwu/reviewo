import type { RatingAggregateDto } from "../../ratings/dto/rating-aggregate.dto.js";
import type { UserRatingDto } from "../../ratings/dto/rating-response.dto.js";
import type { TrustConfidenceDto } from "../../trust/dto/trust-confidence.dto.js";
import type { EnsureEntityForUrlMode } from "../../entities/interfaces/ensure-entity-for-url.js";
import type { ExtensionEntitySummaryDto } from "./extension-resolve-response.dto.js";
import type { ExtensionUrlDto } from "./extension-resolve-response.dto.js";
import type { ExtensionWebLinkDto } from "./extension-resolve-response.dto.js";

export class ExtensionEntityProvisionDto {
  mode!: EnsureEntityForUrlMode;
}

export class ExtensionByUrlRatingResponseDto {
  entity!: ExtensionEntitySummaryDto;
  entityProvision!: ExtensionEntityProvisionDto;
  myRating!: UserRatingDto;
  rating!: RatingAggregateDto;
  trust!: TrustConfidenceDto;
  url!: ExtensionUrlDto;
  web!: ExtensionWebLinkDto;
}
