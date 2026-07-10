import { apiRequest } from "../../../lib/api/api-client";
import type {
  AdminContributorsResponse,
  EconomyOverview,
  PlatformHealth,
  SpotlightAnalytics
} from "../types/admin-economy";

export function fetchPlatformHealth(accessToken: string): Promise<PlatformHealth> {
  return apiRequest<PlatformHealth>("/admin/community/platform/health", {
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });
}

export function fetchEconomyOverview(accessToken: string): Promise<EconomyOverview> {
  return apiRequest<EconomyOverview>("/admin/community/economy/overview", {
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });
}

export function fetchSpotlightAnalytics(
  accessToken: string,
  days = 30
): Promise<SpotlightAnalytics> {
  return apiRequest<SpotlightAnalytics>(`/admin/community/economy/spotlight?days=${days}`, {
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });
}

export function fetchTopContributors(
  accessToken: string,
  options?: { cursor?: string; limit?: number }
): Promise<AdminContributorsResponse> {
  const params = new URLSearchParams();

  if (options?.limit) {
    params.set("limit", String(options.limit));
  }

  if (options?.cursor) {
    params.set("cursor", options.cursor);
  }

  const query = params.toString();

  return apiRequest<AdminContributorsResponse>(
    `/admin/community/contributors${query ? `?${query}` : ""}`,
    {
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    }
  );
}
