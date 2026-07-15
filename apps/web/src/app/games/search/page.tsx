import type { Metadata } from "next";

import { GamesSearchView } from "../../../features/games/components/games-search-view";

export const metadata: Metadata = {
  description: "Find Dota teammates looking for a party right now on Opinia Games.",
  title: "Teammate search | Opinia Games"
};

export default function GamesSearchPage() {
  return (
    <main className="shell entity-route">
      <GamesSearchView />
    </main>
  );
}
