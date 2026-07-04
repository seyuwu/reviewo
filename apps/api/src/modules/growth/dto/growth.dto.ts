export interface GrowthCompareSideDto {
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

export interface GrowthCompareResponseDto {
  left: GrowthCompareSideDto;
  pairSlug: string;
  right: GrowthCompareSideDto;
}

export interface GrowthBattleSideDto extends GrowthCompareSideDto {
  voteCount: number;
  votePercent: number;
}

export interface GrowthBattleResponseDto {
  hasVoted: boolean;
  left: GrowthBattleSideDto;
  pairSlug: string;
  right: GrowthBattleSideDto;
  totalVotes: number;
  votedEntityId: string | null;
}

export interface GrowthBattleVoteResponseDto {
  battle: GrowthBattleResponseDto;
}
