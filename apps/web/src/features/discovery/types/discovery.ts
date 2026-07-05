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

export interface DiscoveryStatsResponse {
  activeBattles: number;
  onlineNow: number;
}

export type DiscoveryRatingsWindow = "week" | "all";

export type DiscussionFeedMode = "live" | "recent" | "popular";

export interface DiscussionFeedItem {
  avgScore: number | null;
  entityId: string;
  entitySlug: string;
  entityTitle: string;
  messageCount: number;
  onlineCount: number;
  previewMessage: string | null;
  votesCount: number | null;
}

export interface DiscussionFeedResponse {
  items: DiscussionFeedItem[];
  mode: DiscussionFeedMode;
}

export interface RandomBattleResponse {
  item: BattlePairListItem | null;
}
