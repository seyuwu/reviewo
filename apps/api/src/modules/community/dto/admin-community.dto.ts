import type { ContributionLevel, SpotlightPlacementType } from "#prisma/client";

export class PlatformMetricDto {
  last1Day!: number;
  last30Days!: number;
  last7Days!: number;
  total!: number;
}

export class ContentFunnelDto {
  discussionsAdded!: number;
  entitiesCreated!: number;
  periodDays!: number;
  ratingsAdded!: number;
  reviewsAdded!: number;
  topsCreated!: number;
}

export class PlatformHealthDto {
  battles!: PlatformMetricDto;
  contentFunnel!: ContentFunnelDto;
  discussions!: PlatformMetricDto;
  entities!: PlatformMetricDto;
  ratings!: PlatformMetricDto;
  reviews!: PlatformMetricDto;
  tops!: PlatformMetricDto;
  users!: PlatformMetricDto;
}

export class ContributionSourceItemDto {
  actionType!: string;
  eventCount!: number;
  points!: number;
  sharePercent!: number;
}

export class EconomyLevelCountDto {
  count!: number;
  level!: ContributionLevel;
}

export class EconomyOverviewDto {
  contributionSources!: ContributionSourceItemDto[];
  creditsExpired!: number;
  creditsGranted!: number;
  creditsSpent!: number;
  placementsByType!: EconomyPlacementTypeCountDto[];
  usersByLevel!: EconomyLevelCountDto[];
  usersEligibleForSpotlight!: number;
  usersLevelContributorOrAbove!: number;
  usersWithBalance!: number;
  usersWithScoreAboveZero!: number;
}

export class EconomyPlacementTypeCountDto {
  count!: number;
  placementType!: SpotlightPlacementType;
}

export class SpotlightConversionMetricsDto {
  battleVote?: number;
  discussion?: number;
  fork?: number;
  like?: number;
  rating?: number;
  review?: number;
}

export class SpotlightTypePerformanceDto {
  clicks!: number;
  conversions!: SpotlightConversionMetricsDto;
  creditsSpent!: number;
  ctr!: number;
  impressions!: number;
  placements!: number;
  placementType!: SpotlightPlacementType;
}

export class SpotlightTopPlacementDto {
  clicks!: number;
  conversions!: SpotlightConversionMetricsDto;
  ctr!: number;
  endsAt!: string;
  impressions!: number;
  placementId!: string;
  placementType!: SpotlightPlacementType;
  sponsorDisplayName!: string;
  startsAt!: string;
  title!: string;
}

export class SpotlightAnalyticsDto {
  byType!: SpotlightTypePerformanceDto[];
  periodDays!: number;
  topPlacements!: SpotlightTopPlacementDto[];
}

export class ContributorScoreBreakdownItemDto {
  actionType!: string;
  points!: number;
  rawCount!: number;
}

export class ContributorSnapshotCountsDto {
  battleVotesCount!: number;
  discussionsCount!: number;
  entitiesCreatedCount!: number;
  fieldFixesCount!: number;
  ratingsCount!: number;
  reviewsCount!: number;
  topsCount!: number;
}

export class AdminContributorDto {
  contributionScore!: number;
  displayName!: string;
  lastActivityAt!: string | null;
  level!: ContributionLevel;
  scoreBreakdown!: ContributorScoreBreakdownItemDto[];
  snapshotCounts!: ContributorSnapshotCountsDto;
  userId!: string;
}

export class AdminContributorsResponseDto {
  items!: AdminContributorDto[];
  nextCursor!: string | null;
}
