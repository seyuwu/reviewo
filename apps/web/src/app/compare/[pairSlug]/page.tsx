import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ComparePageView } from "../../../features/growth/components/compare-page-view";
import { resolveServerContentLocale } from "../../../features/i18n/server-content-locale";
import { appendContentLocaleToPath } from "../../../features/i18n/content-locale";
import { serverApiRequest } from "../../../lib/api/server-api-client";
import { publicEnv } from "../../../lib/config/public-env";
import type { GrowthBattleResponse, GrowthCompareResponse } from "../../../features/growth/types/growth";

interface ComparePageProps {
  params: Promise<{
    pairSlug: string;
  }>;
}

export async function generateMetadata({ params }: ComparePageProps): Promise<Metadata> {
  const { pairSlug } = await params;

  try {
    const compare = await serverApiRequest<GrowthCompareResponse>(
      `/growth/compare/${encodeURIComponent(pairSlug)}`
    );

    return {
      alternates: {
        canonical: new URL(`/compare/${pairSlug}`, publicEnv.siteUrl).toString()
      },
      description: `${compare.left.entity.title} vs ${compare.right.entity.title} — ratings, trust, and reviews on Opinia.`,
      openGraph: {
        title: `${compare.left.entity.title} vs ${compare.right.entity.title}`,
        type: "website",
        url: new URL(`/compare/${pairSlug}`, publicEnv.siteUrl).toString()
      },
      title: `${compare.left.entity.title} vs ${compare.right.entity.title} | Opinia`
    };
  } catch {
    return {
      title: "Compare | Opinia"
    };
  }
}

export default async function ComparePage({ params }: ComparePageProps) {
  const { pairSlug } = await params;

  try {
    const compare = await serverApiRequest<GrowthCompareResponse>(
      `/growth/compare/${encodeURIComponent(pairSlug)}`
    );
    const contentLocale = await resolveServerContentLocale();
    const battle = await serverApiRequest<GrowthBattleResponse>(
      appendContentLocaleToPath(`/growth/battle/${encodeURIComponent(pairSlug)}`, contentLocale)
    );

    return (
      <main className="shell shell-compare">
        <ComparePageView compare={compare} initialBattle={battle} />
      </main>
    );
  } catch {
    notFound();
  }
}
