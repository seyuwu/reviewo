export interface Entity {
  canonicalUrl: string | null;
  createdAt: string;
  description: string | null;
  id: string;
  parentId: string | null;
  slug: string;
  title: string;
  type: string;
  updatedAt: string;
}

export interface RatingDistribution {
  "1": number;
  "2": number;
  "3": number;
  "4": number;
  "5": number;
}

export interface RatingAggregate {
  avgScore: number;
  distribution: RatingDistribution;
  entityId: string;
  updatedAt: string;
  votesCount: number;
}

export interface UserRating {
  createdAt: string;
  entityId: string;
  score: number;
  source: string;
  updatedAt: string;
  userId: string;
}

export interface RateEntityResponse {
  aggregate: RatingAggregate;
  rating: UserRating;
}

export interface Review {
  createdAt: string;
  entityId: string;
  id: string;
  isOwnReview: boolean;
  likedByCurrentUser: boolean;
  likesCount: number;
  text: string;
  updatedAt: string;
}

export interface TrustConfidence {
  confidence: number;
  dataReliability?: number;
  manipulationRisk?: number;
  reliabilityLevel?: "very_high" | "high" | "medium" | "low";
}

export interface EntityPageMeta {
  reviewsCount: number;
}

export interface EntityPageParentSummary {
  canonicalUrl: string | null;
  id: string;
  slug: string;
  title: string;
}

export interface EntityPageResponse {
  entity: Entity;
  meta: EntityPageMeta;
  parent?: EntityPageParentSummary;
  rating: RatingAggregate;
  reviews: Review[];
  trust: TrustConfidence;
}
