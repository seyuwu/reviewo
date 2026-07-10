import type { ContributionLevel, SpotlightPlacementType } from "#prisma/client";
import { IsInt, IsIn, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from "class-validator";

import {
  SPOTLIGHT_HOURS_PER_CREDIT,
  SPOTLIGHT_MAX_ACTIVE_PLACEMENTS_PER_USER,
  SPOTLIGHT_MAX_SPEND_PER_REQUEST,
  SPOTLIGHT_MIN_TRUST_SCORE,
  SPOTLIGHT_SPEND_COSTS
} from "../constants/spotlight-credits.js";
import {
  SPOTLIGHT_MESSAGE_MAX_LENGTH,
  SPOTLIGHT_MESSAGE_MIN_LENGTH
} from "../lib/spotlight-recommendation.mapper.js";

export class SpotlightCreditsDto {
  activePlacements!: number;
  balance!: number;
  level!: ContributionLevel;
  maxActivePlacements!: number;
  monthlyGrant!: number;
}

export class SpotlightRecommendationEntityRatingDto {
  avgScore!: number;
  votesCount!: number;
}

export class SpotlightRecommendationDto {
  authorDisplayName!: string;
  creditsSpent!: number;
  endsAt!: string;
  endorsementsCount?: number;
  entityRating?: SpotlightRecommendationEntityRatingDto;
  reviewExcerpt?: string;
  reviewId?: string;
  recommendationMessage?: string;
  supportedByCredits!: true;
  viewerCanEndorse?: boolean;
  viewerHasEndorsed?: boolean;
}

export class SpotlightPlacementDto {
  endsAt!: string;
  entityCanonicalUrl?: string | null;
  entityId?: string;
  entityLogoUrl?: string | null;
  href!: string;
  pairSlug?: string;
  placementId!: string;
  placementType!: SpotlightPlacementType;
  recommendation?: SpotlightRecommendationDto;
  sponsorDisplayName!: string;
  startsAt!: string;
  title!: string;
}

export class SpotlightFeedResponseDto {
  items!: SpotlightPlacementDto[];
}

export class SpendSpotlightResponseDto {
  balance!: number;
  placement!: SpotlightPlacementDto;
}

export class SpotlightEndorseResponseDto {
  endorsementsCount!: number;
  viewerHasEndorsed!: boolean;
}

export class CreateSpotlightEntityDto {
  @IsUUID()
  entityId!: string;

  @IsOptional()
  @IsInt()
  @Min(SPOTLIGHT_SPEND_COSTS.entity_spotlight)
  @Max(SPOTLIGHT_MAX_SPEND_PER_REQUEST)
  credits?: number;

  @IsOptional()
  @IsString()
  @MinLength(SPOTLIGHT_MESSAGE_MIN_LENGTH)
  @MaxLength(SPOTLIGHT_MESSAGE_MAX_LENGTH)
  message?: string;

  @IsOptional()
  @IsIn(["ru", "en"])
  locale?: "ru" | "en";
}

export class CreateSpotlightBattleDto {
  @IsString()
  @MaxLength(200)
  pairSlug!: string;

  @IsOptional()
  @IsInt()
  @Min(SPOTLIGHT_SPEND_COSTS.battle_boost)
  @Max(SPOTLIGHT_MAX_SPEND_PER_REQUEST)
  credits?: number;

  @IsOptional()
  @IsIn(["ru", "en"])
  locale?: "ru" | "en";
}

export class CreateSpotlightTopDto {
  @IsUUID()
  topId!: string;

  @IsOptional()
  @IsInt()
  @Min(SPOTLIGHT_SPEND_COSTS.top_highlight)
  @Max(SPOTLIGHT_MAX_SPEND_PER_REQUEST)
  credits?: number;

  @IsOptional()
  @IsIn(["ru", "en"])
  locale?: "ru" | "en";
}

export const SPOTLIGHT_COSTS_PUBLIC = {
  battle_boost: SPOTLIGHT_SPEND_COSTS.battle_boost,
  entity_spotlight: SPOTLIGHT_SPEND_COSTS.entity_spotlight,
  hoursPerCredit: SPOTLIGHT_HOURS_PER_CREDIT,
  maxActivePlacements: SPOTLIGHT_MAX_ACTIVE_PLACEMENTS_PER_USER,
  maxSpendPerRequest: SPOTLIGHT_MAX_SPEND_PER_REQUEST,
  minTrustScore: SPOTLIGHT_MIN_TRUST_SCORE,
  top_highlight: SPOTLIGHT_SPEND_COSTS.top_highlight
} as const;
