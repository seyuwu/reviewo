import { appendContentLocaleToPath } from "../../i18n/content-locale";
import { serverApiRequest } from "../../../lib/api/server-api-client";
import type {
  BattlePairListResponse,
  DiscoveryEntityRankListResponse,
  DiscoveryRatingsSort,
  DiscussionFeedResponse,
  RandomBattleResponse
} from "../types/discovery";
import type { ContentLocaleParam } from "../../i18n/content-locale";

async function safeServerRequest<T>(path: string): Promise<T | null> {
  try {
    return await serverApiRequest<T>(path);
  } catch {
    return null;
  }
}

export function fetchActiveBattlesServer(
  limit = 12,
  locale?: ContentLocaleParam
): Promise<BattlePairListResponse | null> {
  const path = locale
    ? appendContentLocaleToPath(`/growth/battles/active?limit=${limit}`, locale)
    : `/growth/battles/active?limit=${limit}`;

  return safeServerRequest<BattlePairListResponse>(path);
}

export function fetchSuggestedBattlesServer(
  limit = 12,
  locale?: ContentLocaleParam
): Promise<BattlePairListResponse | null> {
  const path = locale
    ? appendContentLocaleToPath(`/growth/battles/suggested?limit=${limit}`, locale)
    : `/growth/battles/suggested?limit=${limit}`;

  return safeServerRequest<BattlePairListResponse>(path);
}

export function fetchTopRatingsServer(
  sort: DiscoveryRatingsSort = "votes",
  limit = 20
): Promise<DiscoveryEntityRankListResponse | null> {
  return safeServerRequest<DiscoveryEntityRankListResponse>(
    `/discovery/ratings/top?sort=${sort}&limit=${limit}`
  );
}

export function fetchRisingRatingsServer(limit = 20): Promise<DiscoveryEntityRankListResponse | null> {
  return safeServerRequest<DiscoveryEntityRankListResponse>(`/discovery/ratings/rising?window=day&limit=${limit}`);
}

export function fetchDiscussionFeedServer(
  limit = 6,
  locale?: ContentLocaleParam
): Promise<DiscussionFeedResponse | null> {
  const path = locale
    ? appendContentLocaleToPath(`/discovery/discussions/feed?limit=${limit}`, locale)
    : `/discovery/discussions/feed?limit=${limit}`;

  return safeServerRequest<DiscussionFeedResponse>(path);
}

export function fetchRandomBattleServer(
  locale?: ContentLocaleParam
): Promise<RandomBattleResponse | null> {
  const path = locale
    ? appendContentLocaleToPath("/discovery/battles/random", locale)
    : "/discovery/battles/random";

  return safeServerRequest<RandomBattleResponse>(path);
}
