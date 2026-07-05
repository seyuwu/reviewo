export interface BattlePairListItemDto {
  isSuggested: boolean;
  leftEntityId: string;
  leftLabel: string;
  leftPercent: number;
  leftSlug: string;
  pairSlug: string;
  rightEntityId: string;
  rightLabel: string;
  rightPercent: number;
  rightSlug: string;
  totalVotes: number;
}

export interface BattlePairListDto {
  items: BattlePairListItemDto[];
}

export interface DiscoveryEntityRankItemDto {
  avgScore: number;
  entityId: string;
  recentVotes: number;
  slug: string;
  title: string;
  votesCount: number;
}

export interface DiscoveryEntityRankListDto {
  items: DiscoveryEntityRankItemDto[];
}
