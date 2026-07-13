import type { Metadata } from "next";

import { GamesHubView } from "../../features/games/components/games-hub-view";

export const metadata: Metadata = {
  description: "Игровые профили с репутацией от тиммейтов на Opinia.",
  title: "Игры | Opinia"
};

export default function GamesHubPage() {
  return (
    <main className="shell shell-home">
      <GamesHubView />
    </main>
  );
}
