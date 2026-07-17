import type { Metadata } from "next";

import { DotaCreateTeamGate } from "../../../../features/dota/components/dota-create-team-gate";

export const metadata: Metadata = {
  description: "Создай постоянную Dota-команду или временное пати из 5 игроков на Opinia.",
  title: "Создать команду или пати | Opinia"
};

export default function DotaCreateTeamPage() {
  return (
    <main className="shell entity-route">
      <DotaCreateTeamGate />
    </main>
  );
}
