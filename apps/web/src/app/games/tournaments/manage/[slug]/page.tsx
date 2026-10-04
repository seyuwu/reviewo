import { AdminDotaTournamentMatchesView } from "../../../../../features/tournaments/components/admin-dota-tournament-matches-view";

export default async function TournamentManagementMatchesPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <main className="shell entity-route">
      <AdminDotaTournamentMatchesView
        allowTournamentModerator
        backHref="/games/tournaments/manage"
        slug={slug}
      />
    </main>
  );
}
