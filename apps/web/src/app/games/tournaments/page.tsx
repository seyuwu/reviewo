import type { Metadata } from "next";

import { DotaTournamentsView } from "../../../features/tournaments/components/dota-tournaments-view";

export const metadata: Metadata = {
  description: "Турниры FDP по Dota 2: регистрация команд и составы игроков.",
  title: "Турниры по Dota 2 — FDP"
};

export default function DotaTournamentsPage() {
  return (
    <main className="shell entity-route">
      <DotaTournamentsView />
    </main>
  );
}
