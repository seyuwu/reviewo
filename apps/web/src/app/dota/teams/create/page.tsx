import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DotaCreateTeamGate } from "../../../../features/dota/components/dota-create-team-gate";

export const metadata: Metadata = {
  description: "Создай постоянную Dota-команду или временное пати из 5 игроков на Opinia.",
  title: "Создать команду или пати | Opinia"
};

interface DotaCreateTeamPageProps {
  searchParams: Promise<{ from?: string; tournament?: string }>;
}

export default async function DotaCreateTeamPage({ searchParams }: DotaCreateTeamPageProps) {
  const { from, tournament } = await searchParams;
  if (tournament) {
    redirect(`/games/tournaments/${encodeURIComponent(tournament)}?create=1#registered-teams`);
  }
  return (
    <main className="shell entity-route">
      <DotaCreateTeamGate
        allowClosedCommunity={from === "tournaments"}
        tournamentSlug={undefined}
      />
    </main>
  );
}
