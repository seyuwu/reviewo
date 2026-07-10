import { appendContentLocaleToPath } from "../../i18n/content-locale";
import { apiRequest } from "../../../lib/api/api-client";
import type {
  BattlePairListResponse,
  DiscoveryEntityRankListResponse,
  DiscoveryRatingsSort,
  DiscoveryStatsResponse,
  DiscussionFeedResponse,
  RandomBattleResponse
} from "../types/discovery";
import type { ContentLocaleParam } from "../../i18n/content-locale";

export function fetchActiveBattles(
  limit = 12,
  locale?: ContentLocaleParam
): Promise<BattlePairListResponse> {
  const path = locale
    ? appendContentLocaleToPath(`/growth/battles/active?limit=${limit}`, locale)
    : `/growth/battles/active?limit=${limit}`;

  return apiRequest<BattlePairListResponse>(path);
}

export function fetchSuggestedBattles(
  limit = 12,
  locale?: ContentLocaleParam
): Promise<BattlePairListResponse> {
  const path = locale
    ? appendContentLocaleToPath(`/growth/battles/suggested?limit=${limit}`, locale)
    : `/growth/battles/suggested?limit=${limit}`;

  return apiRequest<BattlePairListResponse>(path);
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

export function fetchDiscussionFeed(
  limit = 6,
  locale?: ContentLocaleParam
): Promise<DiscussionFeedResponse> {
  const path = locale
    ? appendContentLocaleToPath(`/discovery/discussions/feed?limit=${limit}`, locale)
    : `/discovery/discussions/feed?limit=${limit}`;

  return apiRequest<DiscussionFeedResponse>(path);
}

export function fetchRandomBattle(locale?: ContentLocaleParam): Promise<RandomBattleResponse> {
  const path = locale
    ? appendContentLocaleToPath("/discovery/battles/random", locale)
    : "/discovery/battles/random";

  return apiRequest<RandomBattleResponse>(path);
}
