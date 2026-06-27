import type { EntityType } from "@prisma/client";

import type { RatingAggregateDto } from "../../ratings/dto/rating-aggregate.dto.js";
import type { TrustConfidenceDto } from "../../trust/dto/trust-confidence.dto.js";

export class ExtensionUrlDto {
  canonical!: string;
  input!: string;
}

export class ExtensionEntitySummaryDto {
  canonicalUrl!: string | null;
  description!: string | null;
  id!: string;
  slug!: string;
  title!: string;
  type!: EntityType;
}

export class ExtensionWebLinkDto {
  entityPagePath!: string;
}

export class ExtensionResolveEntityBundleDto {
  entity!: ExtensionEntitySummaryDto;
  rating!: RatingAggregateDto;
  trust!: TrustConfidenceDto;
  web!: ExtensionWebLinkDto;
}

export class ExtensionResolveFoundResponseDto {
  entity!: ExtensionEntitySummaryDto;
  parent?: ExtensionResolveEntityBundleDto;
  rating!: RatingAggregateDto;
  status!: "found";
  trust!: TrustConfidenceDto;
  url!: ExtensionUrlDto;
  web!: ExtensionWebLinkDto;
}

export class ExtensionResolveNotFoundResponseDto {
  canCreateEntity!: true;
  status!: "not_found";
  url!: ExtensionUrlDto;
}

export type ExtensionResolveResponseDto =
  | ExtensionResolveFoundResponseDto
  | ExtensionResolveNotFoundResponseDto;
