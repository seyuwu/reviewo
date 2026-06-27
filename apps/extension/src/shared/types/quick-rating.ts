export interface ExtensionUserRating {
  createdAt: string;
  entityId: string;
  score: number;
  source: string;
  updatedAt: string;
  userId: string;
}

export interface ExtensionQuickRatingResponse {
  entity: {
    canonicalUrl: string | null;
    description: string | null;
    id: string;
    slug: string;
    title: string;
    type: string;
  };
  myRating: ExtensionUserRating;
  rating: {
    avgScore: number;
    entityId: string;
    updatedAt: string;
    votesCount: number;
  };
  trust: {
    confidence: number;
  };
  web: {
    entityPagePath: string;
  };
}
