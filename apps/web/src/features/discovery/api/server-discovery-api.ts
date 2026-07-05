import { serverApiRequest } from "../../../lib/api/server-api-client";
import type {
  BattlePairListResponse,
  DiscoveryEntityRankListResponse,
  DiscoveryRatingsWindow
} from "../types/discovery";

async function safeServerRequest<T>(path: string): Promise<T | null> {
  try {
    return await serverApiRequest<T>(path);
  } catch {
    return null;
  }
}

export function fetchActiveBattlesServer(limit = 12): Promise<BattlePairListResponse | null> {
  return safeServerRequest<BattlePairListResponse>(`/growth/battles/active?limit=${limit}`);
}

export function fetchSuggestedBattlesServer(limit = 12): Promise<BattlePairListResponse | null> {
  return safeServerRequest<BattlePairListResponse>(`/growth/battles/suggested?limit=${limit}`);
}

export function fetchTopRatingsServer(
  window: DiscoveryRatingsWindow = "all",
  limit = 20
): Promise<DiscoveryEntityRankListResponse | null> {
  return safeServerRequest<DiscoveryEntityRankListResponse>(
    `/discovery/ratings/top?window=${window}&limit=${limit}`
  );
}

export function fetchRisingRatingsServer(limit = 20): Promise<DiscoveryEntityRankListResponse | null> {
  return safeServerRequest<DiscoveryEntityRankListResponse>(`/discovery/ratings/rising?window=day&limit=${limit}`);
}
