export interface UserTrustComponentsDto {
  accountAgeBonus: number;
  anomalyPenalty: number;
  consensus: number;
  coverage: number;
  diversity: number;
  stability: number;
}

export interface UserTrustBehaviorSummaryDto {
  firstRatingAt: string | null;
  lastRatingAt: string | null;
  totalRatings: number;
  uniqueEntities: number;
  uniqueRootDomains: number;
}

export interface UserTrustProfileDto {
  calculatedAt: string;
  calculationVersion: number;
  components: UserTrustComponentsDto;
  behaviorSummary: UserTrustBehaviorSummaryDto;
  trustScore: number;
  userId: string;
}
