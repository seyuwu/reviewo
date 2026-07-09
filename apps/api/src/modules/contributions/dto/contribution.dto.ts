import type { ContributionStatus, ContributionTier, ContributionType } from "#prisma/client";

export class ContributionDto {
  id!: string;
  entityId!: string;
  authorId!: string;
  type!: ContributionType;
  payload!: unknown;
  status!: ContributionStatus;
  tier!: ContributionTier;
  approvalsWeight!: number;
  rejectionsWeight!: number;
  requiredApprovalsWeight!: number;
  minUniqueVoters!: number;
  requiredRejectionsWeight!: number;
  createdAt!: string;
  resolvedAt!: string | null;
  appliedAt!: string | null;
  resolvedBy!: string | null;
}

export class ContributionListResponseDto {
  items!: ContributionDto[];
}
