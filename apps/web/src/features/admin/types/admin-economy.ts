export type ContributionLevel =
  | "active_contributor"
  | "contributor"
  | "curator"
  | "newcomer"
  | "pioneer";

export type SpotlightPlacementType = "battle_boost" | "entity_spotlight" | "top_highlight";

export interface PlatformMetric {
  last1Day: number;
  last30Days: number;
  last7Days: number;
  total: number;
}

export interface ContentFunnel {
  discussionsAdded: number;
  entitiesCreated: number;
  periodDays: number;
  ratingsAdded: number;
  reviewsAdded: number;
  topsCreated: number;
}

export interface PlatformHealth {
  battles: PlatformMetric;
  contentFunnel: ContentFunnel;
  discussions: PlatformMetric;
  entities: PlatformMetric;
  ratings: PlatformMetric;
  reviews: PlatformMetric;
  tops: PlatformMetric;
  users: PlatformMetric;
}

export interface ContributionSourceItem {
  actionType: string;
  eventCount: number;
  points: number;
  sharePercent: number;
}

export interface EconomyLevelCount {
  count: number;
  level: ContributionLevel;
}

export interface EconomyPlacementTypeCount {
  count: number;
  placementType: SpotlightPlacementType;
}

export interface EconomyOverview {
  contributionSources: ContributionSourceItem[];
  creditsExpired: number;
  creditsGranted: number;
  creditsSpent: number;
  placementsByType: EconomyPlacementTypeCount[];
  usersByLevel: EconomyLevelCount[];
  usersEligibleForSpotlight: number;
  usersLevelContributorOrAbove: number;
  usersWithBalance: number;
  usersWithScoreAboveZero: number;
}

export interface SpotlightConversionMetrics {
  battleVote?: number;
  discussion?: number;
  fork?: number;
  like?: number;
  rating?: number;
  review?: number;
}

export interface SpotlightTypePerformance {
  clicks: number;
  conversions: SpotlightConversionMetrics;
  creditsSpent: number;
  ctr: number;
  impressions: number;
  placements: number;
  placementType: SpotlightPlacementType;
}

export interface SpotlightTopPlacement {
  clicks: number;
  conversions: SpotlightConversionMetrics;
  ctr: number;
  endsAt: string;
  impressions: number;
  placementId: string;
  placementType: SpotlightPlacementType;
  sponsorDisplayName: string;
  startsAt: string;
  title: string;
}

export interface SpotlightAnalytics {
  byType: SpotlightTypePerformance[];
  periodDays: number;
  topPlacements: SpotlightTopPlacement[];
}

export interface ContributorScoreBreakdownItem {
  actionType: string;
  points: number;
  rawCount: number;
}

export interface ContributorSnapshotCounts {
  battleVotesCount: number;
  discussionsCount: number;
  entitiesCreatedCount: number;
  fieldFixesCount: number;
  ratingsCount: number;
  reviewsCount: number;
  topsCount: number;
}

export interface AdminContributor {
  contributionScore: number;
  displayName: string;
  lastActivityAt: string | null;
  level: ContributionLevel;
  scoreBreakdown: ContributorScoreBreakdownItem[];
  snapshotCounts: ContributorSnapshotCounts;
  userId: string;
}

export interface AdminContributorsResponse {
  items: AdminContributor[];
  nextCursor: string | null;
}
