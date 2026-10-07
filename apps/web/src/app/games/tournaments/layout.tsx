import type { ReactNode } from "react";
import { TournamentTelegramOnboarding } from "../../../features/tournaments/components/tournament-telegram-onboarding";

export default function TournamentsLayout({ children }: { children: ReactNode }) {
  return <TournamentTelegramOnboarding>{children}</TournamentTelegramOnboarding>;
}
