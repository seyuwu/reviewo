import {
  fetchActiveBattlesServer,
  fetchDiscussionFeedServer,
  fetchRandomBattleServer,
  fetchRisingRatingsServer,
  fetchSuggestedBattlesServer,
  fetchTopRatingsServer
} from "../api/server-discovery-api";
import type {
  BattlePairListItem,
  DiscoveryEntityRankItem,
  DiscussionFeedResponse,
  RandomBattleResponse
} from "../types/discovery";

export interface HomeFeedInitialData {
  activeBattlePairs: BattlePairListItem[];
  discussionFeed: DiscussionFeedResponse;
  randomBattle: RandomBattleResponse;
  risingItems: DiscoveryEntityRankItem[];
  suggestedBattlePairs: BattlePairListItem[];
  weekTopItems: DiscoveryEntityRankItem[];
}

const EMPTY_DISCUSSION_FEED: DiscussionFeedResponse = {
  items: [],
  mode: "popular"
};

export async function loadHomeFeedData(): Promise<HomeFeedInitialData> {
  const [activeBattles, suggestedBattles, rising, weekTop, discussionFeed, randomBattle] = await Promise.all([
    fetchActiveBattlesServer(4),
    fetchSuggestedBattlesServer(4),
    fetchRisingRatingsServer(6),
    fetchTopRatingsServer("week", 6),
    fetchDiscussionFeedServer(6),
    fetchRandomBattleServer()
  ]);

  return {
    activeBattlePairs: activeBattles?.items ?? [],
    discussionFeed: discussionFeed ?? EMPTY_DISCUSSION_FEED,
    randomBattle: randomBattle ?? { item: null },
    risingItems: rising?.items ?? [],
    suggestedBattlePairs: suggestedBattles?.items ?? [],
    weekTopItems: weekTop?.items ?? []
  };
}
