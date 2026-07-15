import type { Metadata } from "next";

import { GamesCommunityView } from "../../../features/games/components/games-community-view";

export const metadata: Metadata = {
  description: "Your Dota teams, parties, friends, and invites on Opinia Games.",
  title: "Community | Opinia Games"
};

export default function GamesCommunityPage() {
  return (
    <main className="shell entity-route">
      <GamesCommunityView />
    </main>
  );
}
