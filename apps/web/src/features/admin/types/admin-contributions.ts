import type { Contribution, ContributionType } from "../../contributions/types/contributions";

export interface AdminContributionAuthor {
  displayName: string;
  id: string;
}

export interface AdminContributionEntity {
  canonicalUrl: string | null;
  id: string;
  slug: string;
  title: string;
}

export interface AdminContributionListItem extends Contribution {
  author: AdminContributionAuthor;
  entity: AdminContributionEntity;
}

export interface AdminContributionListResponse {
  items: AdminContributionListItem[];
  nextCursor: string | null;
}

export type AdminContributionTypeFilter = ContributionType | "ALL";

export interface AdminContributionStats {
  appliedLast7Days: number;
  oldestPendingAt: string | null;
  pendingByType: Record<ContributionType, number>;
  pendingTotal: number;
  rejectedLast7Days: number;
}

export interface EditorStats {
  appliedCount: number;
  editorScorePercent: number | null;
  pendingCount: number;
  rejectedCount: number;
  totalSubmitted: number;
}
