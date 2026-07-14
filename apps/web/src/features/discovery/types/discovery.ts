export interface BattlePairListItem {
  isSuggested: boolean;
  leftCanonicalUrl: string | null;
  leftEntityId: string;
  leftLabel: string;
  leftLogoUrl: string | null;
  leftPercent: number;
  leftSlug: string;
  pairSlug: string;
  rightCanonicalUrl: string | null;
  rightEntityId: string;
  rightLabel: string;
  rightLogoUrl: string | null;
  rightPercent: number;
  rightSlug: string;
  totalVotes: number;
}

export interface BattlePairListResponse {
  items: BattlePairListItem[];
}

export interface DiscoveryEntityRankItem {
  avgScore: number;
  canonicalUrl: string | null;
  entityId: string;
  logoUrl: string | null;
  recentVotes: number;
  reliability: number | null;
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

export type DiscoveryRatingsSort = "week" | "votes" | "reliability";

export type DiscussionFeedMode = "live" | "recent" | "popular";

export interface DiscussionFeedItem {
  avgScore: number | null;
  entityCanonicalUrl: string | null;
  entityId: string;
  entityLogoUrl: string | null;
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
