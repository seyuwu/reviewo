export interface BattlePairListItem {
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

export interface BattlePairListResponse {
  items: BattlePairListItem[];
}

export interface DiscoveryEntityRankItem {
  avgScore: number;
  entityId: string;
  recentVotes: number;
  slug: string;
  title: string;
  votesCount: number;
}

export interface DiscoveryEntityRankListResponse {
  items: DiscoveryEntityRankItem[];
}

export type DiscoveryRatingsWindow = "week" | "all";
