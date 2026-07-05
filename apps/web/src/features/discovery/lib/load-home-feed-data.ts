import {
  fetchActiveBattlesServer,
  fetchRisingRatingsServer,
  fetchSuggestedBattlesServer,
  fetchTopRatingsServer
} from "../api/server-discovery-api";
import type { BattlePairListItem, DiscoveryEntityRankItem } from "../types/discovery";

export interface HomeFeedInitialData {
  battlePairs: BattlePairListItem[];
  risingItems: DiscoveryEntityRankItem[];
  weekTopItems: DiscoveryEntityRankItem[];
}

export async function loadHomeFeedData(): Promise<HomeFeedInitialData> {
  const [activeBattles, rising, weekTop] = await Promise.all([
    fetchActiveBattlesServer(4),
    fetchRisingRatingsServer(6),
    fetchTopRatingsServer("week", 6)
  ]);

  let battlePairs = activeBattles?.items ?? [];

  if (battlePairs.length === 0) {
    const suggested = await fetchSuggestedBattlesServer(4);
    battlePairs = suggested?.items ?? [];
  }

  return {
    battlePairs,
    risingItems: rising?.items ?? [],
    weekTopItems: weekTop?.items ?? []
  };
}
