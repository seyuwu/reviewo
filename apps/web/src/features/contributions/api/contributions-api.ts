import { apiRequest } from "../../../lib/api/api-client";
import type {
  Contribution,
  ContributionListResponse,
  CreateContributionInput,
  DuplicateSuggestionsResponse,
  FieldProvenanceListResponse
} from "../types/contributions";

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`
  };
}

export function fetchEntityContributions(
  entityId: string,
  status = "PENDING"
): Promise<ContributionListResponse> {
  const params = new URLSearchParams({ status });

  return apiRequest<ContributionListResponse>(
    `/entities/${entityId}/contributions?${params.toString()}`
  );
}

export function fetchFieldProvenance(entityId: string): Promise<FieldProvenanceListResponse> {
  return apiRequest<FieldProvenanceListResponse>(`/entities/${entityId}/field-provenance`);
}

export function fetchDuplicateSuggestions(entityId: string): Promise<DuplicateSuggestionsResponse> {
  return apiRequest<DuplicateSuggestionsResponse>(`/entities/${entityId}/duplicate-suggestions`);
}

export function createContribution(
  entityId: string,
  input: CreateContributionInput,
  accessToken: string
): Promise<Contribution> {
  return apiRequest<Contribution>(`/entities/${entityId}/contributions`, {
    body: input,
    headers: authHeaders(accessToken),
    method: "POST"
  });
}

export function voteContribution(
  contributionId: string,
  kind: "APPROVE" | "REJECT",
  accessToken: string
): Promise<Contribution> {
  return apiRequest<Contribution>(`/contributions/${contributionId}/vote`, {
    body: { kind },
    headers: authHeaders(accessToken),
    method: "POST"
  });
}

export function resolveContribution(
  contributionId: string,
  action: "apply" | "reject",
  accessToken: string
): Promise<Contribution> {
  return apiRequest<Contribution>(`/admin/contributions/${contributionId}/resolve`, {
    body: { action },
    headers: authHeaders(accessToken),
    method: "POST"
  });
}
