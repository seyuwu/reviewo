export interface BattlePairListItemDto {
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

export interface BattlePairListDto {
  items: BattlePairListItemDto[];
}

export interface DiscoveryEntityRankItemDto {
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

export interface DiscussionFeedDto {
  items: DiscussionFeedItemDto[];
  mode: DiscussionFeedMode;
}

export interface RandomBattleDto {
  item: BattlePairListItemDto | null;
}
