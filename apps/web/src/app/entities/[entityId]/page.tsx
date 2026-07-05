import type { Metadata } from "next";
import { Suspense } from "react";

import { EntityPageView } from "../../../features/entity-page/components/entity-page-view";
import { serverApiRequest } from "../../../lib/api/server-api-client";
import type { EntityPageResponse } from "../../../features/entity-page/types/entity-page";
import { buildEntityOgImageUrl, buildEntityShareUrl } from "../../../features/growth/lib/share-urls";

interface EntityPageRouteProps {
  params: Promise<{
    entityId: string;
  }>;
  searchParams: Promise<{
    q?: string;
  }>;
}

export async function generateMetadata({ params }: EntityPageRouteProps): Promise<Metadata> {
  const { entityId } = await params;

  try {
    const pageData = await serverApiRequest<EntityPageResponse>(`/entities/${entityId}/page`);
    const pageUrl = buildEntityShareUrl(entityId);
    const ogImage = buildEntityOgImageUrl(entityId);
    const trustPercent = Math.round(pageData.trust.confidence * 100);

    return {
      alternates: {
        canonical: pageUrl
      },
      description: `${pageData.entity.title}: ${pageData.rating.avgScore.toFixed(1)}/5, ${trustPercent}% trust, ${pageData.meta.reviewsCount} reviews on Opinia.`,
      openGraph: {
        description: `${pageData.rating.avgScore.toFixed(1)}/5 · ${trustPercent}% trust · ${pageData.meta.reviewsCount} reviews`,
        images: [{ url: ogImage }],
        title: pageData.entity.title,
        type: "website",
        url: pageUrl
      },
      title: `${pageData.entity.title} | Opinia`,
      twitter: {
        card: "summary_large_image",
        images: [ogImage],
        title: pageData.entity.title
      }
    };
  } catch {
    return {
      title: "Entity | Opinia"
    };
  }
}

export default async function EntityPageRoute({ params, searchParams }: EntityPageRouteProps) {
  const { entityId } = await params;
  const { q } = await searchParams;

  return (
    <main className="shell entity-route">
      <Suspense fallback={null}>
        <EntityPageView entityId={entityId} />
      </Suspense>
    </main>
  );
}
