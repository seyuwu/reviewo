import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BattlePageView } from "../../../features/growth/components/battle-page-view";
import { serverApiRequest } from "../../../lib/api/server-api-client";
import { publicEnv } from "../../../lib/config/public-env";
import type { GrowthBattleResponse } from "../../../features/growth/types/growth";

interface BattlePageProps {
  params: Promise<{
    pairSlug: string;
  }>;
}

export async function generateMetadata({ params }: BattlePageProps): Promise<Metadata> {
  const { pairSlug } = await params;

  try {
    const battle = await serverApiRequest<GrowthBattleResponse>(`/growth/battle/${pairSlug}`);

    return {
      alternates: {
        canonical: new URL(`/battle/${pairSlug}`, publicEnv.siteUrl).toString()
      },
      description: `Vote: ${battle.left.entity.title} or ${battle.right.entity.title}?`,
      openGraph: {
        title: `${battle.left.entity.title} vs ${battle.right.entity.title} — Battle`,
        type: "website",
        url: new URL(`/battle/${pairSlug}`, publicEnv.siteUrl).toString()
      },
      title: `${battle.left.entity.title} vs ${battle.right.entity.title} — Battle | Opinia`
    };
  } catch {
    return {
      title: "Battle | Opinia"
    };
  }
}

export default async function BattlePage({ params }: BattlePageProps) {
  const { pairSlug } = await params;

  try {
    const battle = await serverApiRequest<GrowthBattleResponse>(`/growth/battle/${pairSlug}`);

    return (
      <main className="shell">
        <BattlePageView battle={battle} pairSlug={pairSlug} />
      </main>
    );
  } catch {
    notFound();
  }
}
