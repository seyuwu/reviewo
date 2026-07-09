import { apiRequest } from "../../../lib/api/api-client";
import type {
  AdminContributionListResponse,
  AdminContributionStats,
  AdminContributionTypeFilter,
  EditorStats
} from "../types/admin-contributions";
import type { Contribution } from "../../contributions/types/contributions";

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`
  };
}

export function fetchAdminContributionStats(accessToken: string): Promise<AdminContributionStats> {
  return apiRequest<AdminContributionStats>("/admin/contributions/stats", {
    headers: authHeaders(accessToken)
  });
}

export function fetchAdminContributions(
  accessToken: string,
  input?: {
    cursor?: string;
    limit?: number;
    type?: AdminContributionTypeFilter;
  }
): Promise<AdminContributionListResponse> {
  const params = new URLSearchParams({ status: "PENDING" });

  if (input?.type && input.type !== "ALL") {
    params.set("type", input.type);
  }

  if (input?.limit) {
    params.set("limit", String(input.limit));
  }

  if (input?.cursor) {
    params.set("cursor", input.cursor);
  }

  return apiRequest<AdminContributionListResponse>(`/admin/contributions?${params.toString()}`, {
    headers: authHeaders(accessToken)
  });
}

export function resolveAdminContribution(
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

export function fetchEditorStats(accessToken: string): Promise<EditorStats> {
  return apiRequest<EditorStats>("/contributions/me/editor-stats", {
    headers: authHeaders(accessToken)
  });
}
