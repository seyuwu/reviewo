import { AdminDotaTournamentsView } from "../../../../features/tournaments/components/admin-dota-tournaments-view";

export default function TournamentManagementPage() {
  return (
    <main className="shell entity-route">
      <AdminDotaTournamentsView
        allowTournamentModerator
        backHref="/games/tournaments"
        basePath="/games/tournaments/manage"
      />
    </main>
  );
}
