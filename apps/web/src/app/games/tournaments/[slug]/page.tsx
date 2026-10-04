import type { Metadata } from "next";

import { DotaTournamentDetailView } from "../../../../features/tournaments/components/dota-tournament-detail-view";

export const metadata: Metadata = {
  description: "Составы команд и регистрация на турнир FDP по Dota 2.",
  title: "Команды турнира — FDP"
};

export default async function DotaTournamentDetailPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <main className="shell entity-route">
      <DotaTournamentDetailView slug={slug} />
    </main>
  );
}
