import { apiRequest } from "../../../lib/api/api-client";
import type {
  AdminGamesLaunchInterestItem,
  AdminGamesLaunchListResponse,
  AdminGamesLaunchMetrics,
  AdminGamesLaunchSuggestionItem
} from "../types/admin-games-launch";

export function fetchAdminGamesLaunchInterests(
  accessToken: string,
  limit = 100
): Promise<AdminGamesLaunchListResponse<AdminGamesLaunchInterestItem>> {
  return apiRequest(`/admin/games/launch/interests?limit=${limit}`, {
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });
}

export function fetchAdminGamesLaunchSuggestions(
  accessToken: string,
  limit = 100
): Promise<AdminGamesLaunchListResponse<AdminGamesLaunchSuggestionItem>> {
  return apiRequest(`/admin/games/launch/suggestions?limit=${limit}`, {
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });
}

export function fetchAdminGamesLaunchMetrics(
  accessToken: string,
  days = 7
): Promise<AdminGamesLaunchMetrics> {
  return apiRequest(`/admin/games/launch/metrics?days=${days}`, {
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });
}
