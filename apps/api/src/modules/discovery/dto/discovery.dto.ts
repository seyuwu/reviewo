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
  reliability: number | null;
  slug: string;
  title: string;
  votesCount: number;
}

export interface DiscoveryEntityRankListDto {
  items: DiscoveryEntityRankItemDto[];
}

export interface DiscoveryStatsDto {
  activeBattles: number;
  onlineNow: number;
}

export type DiscussionFeedMode = "live" | "recent" | "popular";

export interface DiscussionFeedItemDto {
  avgScore: number | null;
  entityId: string;
  entitySlug: string;
  entityTitle: string;
  messageCount: number;
  onlineCount: number;
  previewMessage: string | null;
  votesCount: number | null;
}

export interface DiscussionFeedDto {
  items: DiscussionFeedItemDto[];
  mode: DiscussionFeedMode;
}

export interface RandomBattleDto {
  item: BattlePairListItemDto | null;
}
