import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { DotaTeamView } from "../../../../features/dota/components/dota-team-view";
import { buildDotaTeamOgImageUrl, buildDotaTeamUrl } from "../../../../features/dota/lib/share";
import type { GameParty } from "../../../../features/social/types/social";
import { serverApiRequest } from "../../../../lib/api/server-api-client";

interface DotaTeamPageProps {
  params: Promise<{
    slug: string;
  }>;
}

async function fetchParty(slug: string): Promise<GameParty | null> {
  try {
    return await serverApiRequest<GameParty>(`/social/parties/${encodeURIComponent(slug)}`, {
      cache: "no-store"
    });
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
  const ogImage = buildDotaTeamOgImageUrl(party.slug);
  const seatsLeft = Math.max(0, party.maxMembers - party.memberCount);
  const joinMode =
    (party.joinMode ?? "OPEN") === "OPEN" ? "сразу в команду" : "по заявке";
  const description = `Dota-пати ${party.name}: ${party.memberCount}/${party.maxMembers}, осталось ${seatsLeft}, ${joinMode}. Собери стек на Opinia.`;

  return {
    alternates: {
      canonical: pageUrl
    },
    description,
    openGraph: {
      description,
      images: [{ url: ogImage }],
      title: `${party.name} | Opinia Dota`,
      type: "website",
      url: pageUrl
    },
    title: `${party.name} | Opinia Dota`,
    twitter: {
      card: "summary_large_image",
      images: [ogImage],
      title: party.name
    }
  };
}

export default async function DotaTeamPage({ params }: DotaTeamPageProps) {
  const { slug } = await params;
  const party = await fetchParty(slug);

  if (!party) {
    notFound();
  }

  return (
    <main className="shell entity-route shell-party">
      <Suspense fallback={null}>
        <DotaTeamView party={party} />
      </Suspense>
    </main>
  );
}
