import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { DotaTeamView } from "../../../../features/dota/components/dota-team-view";
import { buildDotaTeamUrl } from "../../../../features/dota/lib/share";
import type { GameParty } from "../../../../features/social/types/social";
import { serverApiRequest } from "../../../../lib/api/server-api-client";

interface DotaTeamPageProps {
  params: Promise<{
    slug: string;
  }>;
}

async function fetchParty(slug: string): Promise<GameParty | null> {
  try {
    return await serverApiRequest<GameParty>(`/social/parties/${encodeURIComponent(slug)}`);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: DotaTeamPageProps): Promise<Metadata> {
  const { slug } = await params;
  const party = await fetchParty(slug);

  if (!party) {
    return {
      title: "Dota team | Opinia"
    };
  }

  const pageUrl = buildDotaTeamUrl(party.slug);
  const description = `Dota-команда ${party.name} на Opinia — ${party.memberCount}/${party.maxMembers}. Собери стек и зови тиммейтов.`;

  return {
    alternates: {
      canonical: pageUrl
    },
    description,
    openGraph: {
      description,
      title: `${party.name} | Opinia Dota`,
      type: "website",
      url: pageUrl
    },
    title: `${party.name} | Opinia Dota`
  };
}

export default async function DotaTeamPage({ params }: DotaTeamPageProps) {
  const { slug } = await params;
  const party = await fetchParty(slug);

  if (!party) {
    notFound();
  }

  return (
    <main className="shell entity-route">
      <Suspense fallback={null}>
        <DotaTeamView party={party} />
      </Suspense>
    </main>
  );
}
