import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { DotaProfileView } from "../../../features/dota/components/dota-profile-view";
import { buildDotaOgImageUrl, buildDotaProfileUrl } from "../../../features/dota/lib/share";
import type { DotaProfile } from "../../../features/dota/types/dota";
import { serverApiRequest } from "../../../lib/api/server-api-client";

interface DotaProfilePageProps {
  params: Promise<{
    slug: string;
  }>;
}

async function fetchProfile(slug: string): Promise<DotaProfile | null> {
  try {
    return await serverApiRequest<DotaProfile>(`/dota/profiles/${encodeURIComponent(slug)}`);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: DotaProfilePageProps): Promise<Metadata> {
  const { slug } = await params;
  const profile = await fetchProfile(slug);

  if (!profile) {
    return {
      title: "Dota profile | Opinia"
    };
  }

  const pageUrl = buildDotaProfileUrl(profile.slug);
  const ogImage = buildDotaOgImageUrl(profile.slug);

  return {
    alternates: {
      canonical: pageUrl
    },
    description: `${profile.title}: Dota ID ${profile.dotaAccountId}, MMR ${profile.mmr ?? "—"}, подтверждения от тиммейтов.`,
    openGraph: {
      description: `Dota ID ${profile.dotaAccountId} · ${profile.progress.current}/${profile.progress.target} подтверждений`,
      images: [{ url: ogImage }],
      title: `${profile.title} | Opinia Dota`,
      type: "website",
      url: pageUrl
    },
    title: `${profile.title} | Opinia Dota`,
    twitter: {
      card: "summary_large_image",
      images: [ogImage],
      title: profile.title
    }
  };
}

export default async function DotaProfilePage({ params }: DotaProfilePageProps) {
  const { slug } = await params;
  const profile = await fetchProfile(slug);

  if (!profile) {
    notFound();
  }

  return (
    <main className="shell entity-route">
      <Suspense fallback={null}>
        <DotaProfileView profile={profile} />
      </Suspense>
    </main>
  );
}
