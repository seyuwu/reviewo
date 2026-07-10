import {
  fetchActiveBattlesServer,
  fetchDiscussionFeedServer,
  fetchRandomBattleServer,
  fetchRisingRatingsServer,
  fetchSuggestedBattlesServer,
  fetchTopRatingsServer
} from "../api/server-discovery-api";
import { fetchSpotlightFeedServer } from "../../spotlight/api/server-spotlight-api";
import type { ContentLocaleParam } from "../../i18n/content-locale";
import type {
  BattlePairListItem,
  DiscoveryEntityRankItem,
  DiscussionFeedResponse,
  RandomBattleResponse
} from "../types/discovery";
import type { SpotlightPlacement } from "../../spotlight/types/spotlight";

export interface HomeFeedInitialData {
  activeBattlePairs: BattlePairListItem[];
  discussionFeed: DiscussionFeedResponse;
  randomBattle: RandomBattleResponse;
  risingItems: DiscoveryEntityRankItem[];
  spotlightItems: SpotlightPlacement[];
  suggestedBattlePairs: BattlePairListItem[];
  weekTopItems: DiscoveryEntityRankItem[];
}

const EMPTY_DISCUSSION_FEED: DiscussionFeedResponse = {
  items: [],
  mode: "popular"
};

export async function loadHomeFeedData(
  discussionLocale?: ContentLocaleParam,
  battleLocale?: ContentLocaleParam
): Promise<HomeFeedInitialData> {
  const resolvedBattleLocale = battleLocale ?? discussionLocale;
  const [activeBattles, suggestedBattles, rising, weekTop, discussionFeed, randomBattle, spotlightFeed] =
    await Promise.all([
    fetchActiveBattlesServer(4, resolvedBattleLocale),
    fetchSuggestedBattlesServer(4, resolvedBattleLocale),
    fetchRisingRatingsServer(6),
    fetchTopRatingsServer("week", 6),
    fetchDiscussionFeedServer(6, discussionLocale),
    fetchRandomBattleServer(resolvedBattleLocale),
    fetchSpotlightFeedServer(3, discussionLocale)
  ]);

  return {
    activeBattlePairs: activeBattles?.items ?? [],
    discussionFeed: discussionFeed ?? EMPTY_DISCUSSION_FEED,
    randomBattle: randomBattle ?? { item: null },
    risingItems: rising?.items ?? [],
    spotlightItems: spotlightFeed?.items ?? [],
    suggestedBattlePairs: suggestedBattles?.items ?? [],
    weekTopItems: weekTop?.items ?? []
  };
}
