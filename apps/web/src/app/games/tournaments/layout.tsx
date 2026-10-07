import type { ReactNode } from "react";
import { TournamentDiscordOnboarding } from "../../../features/tournaments/components/tournament-discord-invite";

export default function TournamentsLayout({ children }: { children: ReactNode }) {
  return <>{children}<TournamentDiscordOnboarding /></>;
}
