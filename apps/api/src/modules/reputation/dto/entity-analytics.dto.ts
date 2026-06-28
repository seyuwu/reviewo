export interface EntityRatingSummaryDto {
  avgScore: number;
  votesCount: number;
}

export interface EntityConfidenceSummaryDto {
  activityDurationDays: number;
  score: number;
  uniqueRaters: number;
}

export interface EntityAnomalySummaryDto {
  burstScore: number;
  clusterScore: number;
  score: number;
  syncScore: number;
}

export interface EntityAnalyticsDto {
  anomaly: EntityAnomalySummaryDto;
  confidence: EntityConfidenceSummaryDto | null;
  entityId: string;
  rating: EntityRatingSummaryDto;
}

export interface EntityConfidenceDto {
  confidence: EntityConfidenceSummaryDto | null;
  entityId: string;
  rating: EntityRatingSummaryDto;
}
