export interface ActiveNowItem {
  entityId: string;
  entitySlug: string;
  entityTitle: string;
  messageCount: number;
  onlineCount: number;
  participantCount: number;
  previewMessage: string | null;
  score: number;
}

export interface GrowthCompareSide {
  entity: {
    canonicalUrl: string | null;
    description: string | null;
    id: string;
    slug: string;
    title: string;
    type: string;
  };
  meta: {
    reviewsCount: number;
  };
  rating: {
    avgScore: number;
    votesCount: number;
  };
  trust: {
    confidence: number;
  };
}

export interface GrowthCompareResponse {
  pairSlug: string;
  left: GrowthCompareSide;
  right: GrowthCompareSide;
}

export interface GrowthBattleSide extends GrowthCompareSide {
  voteCount: number;
  votePercent: number;
}

export interface GrowthBattleResponse {
  hasVoted: boolean;
  left: GrowthBattleSide;
  pairSlug: string;
  right: GrowthBattleSide;
  totalVotes: number;
  votedEntityId: string | null;
}

export interface GrowthBattleVoteResponse {
  battle: GrowthBattleResponse;
}
