export type ContributionType =
  | "UPDATE_NAME"
  | "UPDATE_URL"
  | "UPDATE_DESCRIPTION"
  | "UPDATE_LOGO"
  | "UPDATE_TYPE"
  | "MERGE_ENTITY"
  | "LINK_ENTITY"
  | "UNLINK_ENTITY";

export type ContributionStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "APPLIED"
  | "SUPERSEDED";

export interface Contribution {
  id: string;
  entityId: string;
  authorId: string;
  type: ContributionType;
  payload: unknown;
  status: ContributionStatus;
  tier: "AUTO" | "MODERATION";
  approvalsWeight: number;
  rejectionsWeight: number;
  requiredApprovalsWeight: number;
  minUniqueVoters: number;
  requiredRejectionsWeight: number;
  createdAt: string;
  resolvedAt: string | null;
  appliedAt: string | null;
  resolvedBy: string | null;
}

export interface ContributionListResponse {
  items: Contribution[];
}

export interface FieldProvenance {
  field: string;
  source: "community" | "author" | "system";
  contributionId: string | null;
  confirmedAt: string;
  votersCount: number;
}

export interface FieldProvenanceListResponse {
  items: FieldProvenance[];
}

export interface DuplicateSuggestion {
  entity: {
    canonicalUrl: string | null;
    id: string;
    slug: string;
    title: string;
  };
  matchPercent: number;
  reasons: string[];
}

export interface DuplicateSuggestionsResponse {
  items: DuplicateSuggestion[];
}

export interface CreateContributionInput {
  payload: Record<string, unknown>;
  type: ContributionType;
}
