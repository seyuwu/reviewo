import { apiRequest } from "../../../lib/api/api-client";
import type {
  BattlePairListResponse,
  DiscoveryEntityRankListResponse,
  DiscoveryRatingsWindow
} from "../types/discovery";

export function fetchActiveBattles(limit = 12): Promise<BattlePairListResponse> {
  return apiRequest<BattlePairListResponse>(`/growth/battles/active?limit=${limit}`);
}

export function fetchSuggestedBattles(limit = 12): Promise<BattlePairListResponse> {
  return apiRequest<BattlePairListResponse>(`/growth/battles/suggested?limit=${limit}`);
}

export function fetchTopRatings(
  window: DiscoveryRatingsWindow = "all",
  limit = 20
): Promise<DiscoveryEntityRankListResponse> {
  return apiRequest<DiscoveryEntityRankListResponse>(
    `/discovery/ratings/top?window=${window}&limit=${limit}`
  );
}

export function fetchRisingRatings(limit = 20): Promise<DiscoveryEntityRankListResponse> {
  return apiRequest<DiscoveryEntityRankListResponse>(`/discovery/ratings/rising?window=day&limit=${limit}`);
}
