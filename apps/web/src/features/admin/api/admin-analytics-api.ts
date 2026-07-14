import { apiRequest } from "../../../lib/api/api-client";
import type { AnalyticsOverview } from "../types/admin-analytics";

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
