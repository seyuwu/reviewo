import type { Metadata } from "next";

import { getDotaPublicOrigin } from "../../../lib/config/product-hosts";
import { GamesSearchView } from "../../../features/games/components/games-search-view";

const canonicalUrl = `${getDotaPublicOrigin()}/games/search`;

export const metadata: Metadata = {
  alternates: { canonical: canonicalUrl },
  description:
    "Ищи пати в Dota 2 или собирай игроков по ролям и MMR. Запусти автопоиск в FDP и получай уведомления о пати.",
  openGraph: {
    description:
      "Ищи пати в Dota 2 или собирай игроков по ролям и MMR. Запусти автопоиск в FDP и получай уведомления о пати.",
    title: "Поиск пати в Dota 2 по ролям и MMR — FDP",
    url: canonicalUrl
  },
  title: "Поиск пати в Dota 2 по ролям и MMR — FDP"
};

export default function GamesSearchPage() {
  return (
    <main className="shell entity-route">
      <GamesSearchView />
    </main>
  );
}
