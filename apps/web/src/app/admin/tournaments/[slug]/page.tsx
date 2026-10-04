import type { Metadata } from "next";

import { AdminDotaTournamentMatchesView } from "../../../../features/tournaments/components/admin-dota-tournament-matches-view";

export const metadata: Metadata = {
  title: "Матчи турнира — FDP"
};

export default async function AdminDotaTournamentMatchesPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <AdminDotaTournamentMatchesView slug={slug} />;
}
