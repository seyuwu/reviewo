export type ContributionLevel =
  | "newcomer"
  | "contributor"
  | "active_contributor"
  | "curator"
  | "pioneer";

export interface ContributionExpertise {
  scopeKey: string;
  scopeType: "category" | "entity_type";
  score: number;
}

export interface ContributionCuratorRank {
  categoryId: string;
  categorySlug?: string;
  categoryTitle?: string;
  score: number;
}

export interface ContributionProfile {
  badges: string[];
  battleVotesCount: number;
  curatorRanks: ContributionCuratorRank[];
  discussionsCount: number;
  entitiesCreatedCount: number;
  expertise: ContributionExpertise[];
  fieldFixesCount: number;
  level: ContributionLevel;
  ratingsCount: number;
  reviewsCount: number;
  topsCount: number;
}

export interface ContributeQueueItem {
  entityId?: string;
  href: string;
  leftSlug?: string;
  pairSlug?: string;
  rightSlug?: string;
  slug?: string;
  title: string;
  topId?: string;
  totalVotes?: number;
  viewerHasRated?: boolean;
}

export interface ContributeQueue {
  count: number;
  items: ContributeQueueItem[];
  key: string;
}

export interface ContributeQueuesResponse {
  queues: ContributeQueue[];
}
