import { apiRequest } from "../../../lib/api/api-client";
import type {
  BattlePairListResponse,
  DiscoveryEntityRankListResponse,
  DiscoveryRatingsSort,
  DiscoveryStatsResponse,
  DiscussionFeedResponse,
  RandomBattleResponse
} from "../types/discovery";

export function fetchActiveBattles(limit = 12): Promise<BattlePairListResponse> {
  return apiRequest<BattlePairListResponse>(`/growth/battles/active?limit=${limit}`);
}

export function fetchSuggestedBattles(limit = 12): Promise<BattlePairListResponse> {
  return apiRequest<BattlePairListResponse>(`/growth/battles/suggested?limit=${limit}`);
}

export function fetchTopRatings(
  sort: DiscoveryRatingsSort = "votes",
  limit = 20
): Promise<DiscoveryEntityRankListResponse> {
  return apiRequest<DiscoveryEntityRankListResponse>(
    `/discovery/ratings/top?sort=${sort}&limit=${limit}`
  );
}

export function fetchRisingRatings(limit = 20): Promise<DiscoveryEntityRankListResponse> {
  return apiRequest<DiscoveryEntityRankListResponse>(`/discovery/ratings/rising?window=day&limit=${limit}`);
}

export function fetchDiscoveryStats(): Promise<DiscoveryStatsResponse> {
  return apiRequest<DiscoveryStatsResponse>("/discovery/stats");
}

export function pingSitePresence(visitorId: string): Promise<DiscoveryStatsResponse> {
  return apiRequest<DiscoveryStatsResponse>("/discovery/presence/heartbeat", {
    body: { visitorId },
    method: "POST"
  });
}

export function fetchDiscussionFeed(limit = 6): Promise<DiscussionFeedResponse> {
  return apiRequest<DiscussionFeedResponse>(`/discovery/discussions/feed?limit=${limit}`);
}

export function fetchRandomBattle(): Promise<RandomBattleResponse> {
  return apiRequest<RandomBattleResponse>("/discovery/battles/random");
}
