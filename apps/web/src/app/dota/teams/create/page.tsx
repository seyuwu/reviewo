import type { Metadata } from "next";

import { DotaCreateTeamForm } from "../../../../features/dota/components/dota-team-view";

export const metadata: Metadata = {
  description: "Создай постоянную Dota-команду или временное пати из 5 игроков на Opinia.",
  title: "Создать команду или пати | Opinia"
};

export default function DotaCreateTeamPage() {
  return (
    <main className="shell entity-route">
      <DotaCreateTeamForm />
    </main>
  );
}
