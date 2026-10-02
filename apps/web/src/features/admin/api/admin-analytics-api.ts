import { apiRequest } from "../../../lib/api/api-client";
import type {
  AnalyticsOverview,
  DotaSearchHistoryItem,
  DotaSearchType
} from "../types/admin-analytics";

export function fetchAdminAnalyticsOverview(
  accessToken: string,
  days = 7
): Promise<AnalyticsOverview> {
  return apiRequest<AnalyticsOverview>(`/admin/analytics/overview?days=${days}`, {
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });
}

export function fetchAdminDotaSearchHistory(
  accessToken: string,
  days: number,
  type: DotaSearchType
): Promise<DotaSearchHistoryItem[]> {
  return apiRequest<DotaSearchHistoryItem[]>(
    `/admin/analytics/dota-searches?days=${days}&type=${type}&limit=200`,
    {
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    }
  );
}
