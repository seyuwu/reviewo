import type { Metadata } from "next";
import { DotaTournamentMatchPage } from "../../../../../../features/tournaments/components/dota-tournament-match-page";

export const metadata: Metadata = {
  title: "Матч турнира — FDP",
  description: "Составы, настройки и результат матча турнира FDP."
};

export default async function TournamentMatchPage({
  params
}: {
  params: Promise<{ slug: string; matchId: string }>;
}) {
  const { slug, matchId } = await params;
  return (
    <main className="shell entity-route">
      <DotaTournamentMatchPage slug={slug} matchId={matchId} />
    </main>
  );
}
