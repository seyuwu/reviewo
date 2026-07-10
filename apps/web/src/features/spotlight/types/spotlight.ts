export type SpotlightPlacementType = "entity_spotlight" | "battle_boost" | "top_highlight";

export interface SpotlightRecommendationEntityRating {
  avgScore: number;
  votesCount: number;
}

export interface SpotlightRecommendation {
  authorDisplayName: string;
  creditsSpent: number;
  endsAt: string;
  endorsementsCount?: number;
  entityRating?: SpotlightRecommendationEntityRating;
  reviewExcerpt?: string;
  reviewId?: string;
  recommendationMessage?: string;
  supportedByCredits: true;
  viewerCanEndorse?: boolean;
  viewerHasEndorsed?: boolean;
}

export interface SpotlightPlacement {
  endsAt: string;
  entityCanonicalUrl?: string | null;
  entityId?: string;
  entityLogoUrl?: string | null;
  href: string;
  pairSlug?: string;
  placementId: string;
  placementType: SpotlightPlacementType;
  recommendation?: SpotlightRecommendation;
  sponsorDisplayName: string;
  startsAt: string;
  title: string;
}

export interface SpotlightFeedResponse {
  items: SpotlightPlacement[];
}

export interface SpotlightCredits {
  activePlacements: number;
  balance: number;
  level: string;
  maxActivePlacements: number;
  monthlyGrant: number;
}

export interface SpotlightCosts {
  battle_boost: number;
  entity_spotlight: number;
  hoursPerCredit: number;
  maxActivePlacements: number;
  maxSpendPerRequest: number;
  minTrustScore: number;
  top_highlight: number;
}

export interface SpendSpotlightResponse {
  balance: number;
  placement: SpotlightPlacement;
}

export interface SpotlightEndorseResponse {
  endorsementsCount: number;
  viewerHasEndorsed: boolean;
}

export type SpotlightSpendFormKey = "entity" | "battle" | "top";
