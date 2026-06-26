export interface Entity {
  canonicalUrl: string | null;
  createdAt: string;
  createdBy: string | null;
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
  authorId: string;
  createdAt: string;
  entityId: string;
  id: string;
  likedByCurrentUser: boolean;
  likesCount: number;
  text: string;
  updatedAt: string;
}

export interface TrustConfidence {
  confidence: number;
}

export interface EntityPageMeta {
  reviewsCount: number;
}

export interface EntityPageResponse {
  entity: Entity;
  meta: EntityPageMeta;
  rating: RatingAggregate;
  reviews: Review[];
  trust: TrustConfidence;
}
