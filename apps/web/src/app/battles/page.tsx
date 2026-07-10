import type { Metadata } from "next";
import { Suspense } from "react";

import { BattlesHubView } from "../../features/discovery/components/battles-hub-view";
import {
  fetchActiveBattlesServer,
  fetchSuggestedBattlesServer
} from "../../features/discovery/api/server-discovery-api";
import { resolveServerContentLocale } from "../../features/i18n/server-content-locale";
import { getFallbackBattlePairsFromClient } from "../../features/discovery/lib/client-battle-fallback";

export const metadata: Metadata = {
  description: "Pick a pair and vote for the better service.",
  title: "Battles | Opinia"
};

export default async function BattlesPage() {
  const contentLocale = await resolveServerContentLocale();
  const [activeResponse, suggestedResponse] = await Promise.all([
    fetchActiveBattlesServer(12, contentLocale),
    fetchSuggestedBattlesServer(12, contentLocale)
  ]);

  const initialActivePairs = activeResponse?.items ?? [];
  const initialSuggestedPairs =
    suggestedResponse?.items && suggestedResponse.items.length > 0
      ? suggestedResponse.items
      : getFallbackBattlePairsFromClient();

  return (
    <main className="shell shell-home">
      <Suspense fallback={null}>
        <BattlesHubView
          initialActivePairs={initialActivePairs}
          initialSuggestedPairs={initialSuggestedPairs}
        />
      </Suspense>
    </main>
  );
}
