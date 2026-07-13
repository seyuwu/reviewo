import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { DotaConfirmView } from "../../../../features/dota/components/dota-confirm-view";
import { buildDotaConfirmUrl } from "../../../../features/dota/lib/share";
import type { DotaProfile } from "../../../../features/dota/types/dota";
import { serverApiRequest } from "../../../../lib/api/server-api-client";

interface DotaConfirmPageProps {
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

export async function generateMetadata({ params }: DotaConfirmPageProps): Promise<Metadata> {
  const { slug } = await params;
  const profile = await fetchProfile(slug);

  if (!profile) {
    return {
      title: "Confirm | Opinia Dota"
    };
  }

  return {
    description: `Подтвердите качества игрока ${profile.title}.`,
    openGraph: {
      title: `Подтвердить ${profile.title} | Opinia Dota`,
      url: buildDotaConfirmUrl(profile.slug)
    },
    title: `Подтвердить ${profile.title} | Opinia Dota`
  };
}

export default async function DotaConfirmPage({ params }: DotaConfirmPageProps) {
  const { slug } = await params;
  const profile = await fetchProfile(slug);

  if (!profile) {
    notFound();
  }

  return (
    <main className="shell entity-route">
      <Suspense fallback={null}>
        <DotaConfirmView profile={profile} />
      </Suspense>
    </main>
  );
}
