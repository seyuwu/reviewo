export interface UserTrustProfile {
  calculatedAt: string;
  calculationVersion: number;
  components: {
    accountAgeBonus: number;
    anomalyPenalty: number;
    consensus: number;
    coverage: number;
    diversity: number;
    stability: number;
  };
  behaviorSummary: {
    firstRatingAt: string | null;
    lastRatingAt: string | null;
    totalRatings: number;
    uniqueEntities: number;
    uniqueRootDomains: number;
  };
  trustScore: number;
  userId: string;
}
