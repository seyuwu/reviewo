import type { ContributionStatus, ContributionType } from "#prisma/client";

import type { ContributionDto } from "./contribution.dto.js";

export class AdminContributionAuthorDto {
  displayName!: string;
  id!: string;
}

export class AdminContributionEntityDto {
  canonicalUrl!: string | null;
  id!: string;
  slug!: string;
  title!: string;
}

export type AdminContributionListItemDto = ContributionDto & {
  author: AdminContributionAuthorDto;
  entity: AdminContributionEntityDto;
};

export class AdminContributionListResponseDto {
  items!: AdminContributionListItemDto[];
  nextCursor!: string | null;
}

export class AdminContributionStatsDto {
  appliedLast7Days!: number;
  oldestPendingAt!: string | null;
  pendingByType!: Record<ContributionType, number>;
  pendingTotal!: number;
  rejectedLast7Days!: number;
}

export class EditorStatsDto {
  appliedCount!: number;
  editorScorePercent!: number | null;
  pendingCount!: number;
  rejectedCount!: number;
  totalSubmitted!: number;
}

export interface ListAdminContributionsQuery {
  cursor?: string;
  limit?: number;
  status?: ContributionStatus;
  type?: ContributionType;
}
