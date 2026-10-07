import type { Metadata } from "next";
import { DotaTournamentSquadView } from "../../../../../../features/tournaments/components/dota-tournament-squad-view";

export const metadata: Metadata = { title: "Команда турнира — FDP", description: "Состав, чат и Discord команды турнира FDP." };
export default async function TournamentSquadPage({ params }: { params: Promise<{ slug: string; entryId: string }> }) {
  const { slug, entryId } = await params;
  return <main className="shell entity-route"><DotaTournamentSquadView slug={slug} entryId={entryId} /></main>;
}
