import type { Metadata } from "next";
import { Suspense } from "react";

import { EntityPageView } from "../../../features/entity-page/components/entity-page-view";
import type { EntityPageResponse } from "../../../features/entity-page/types/entity-page";
import { buildEntityOgImageUrl, buildEntityShareUrl } from "../../../features/growth/lib/share-urls";
import { serverApiRequest } from "../../../lib/api/server-api-client";

export const revalidate = 60;

/** Locale of the server-rendered SEO payload: opinia.ru is Russian-first. */
const SSR_CONTENT_LOCALE = "ru";

interface EntityPageRouteProps {
  params: Promise<{
    entityId: string;
  }>;
}

async function fetchEntityPage(entityId: string): Promise<EntityPageResponse | null> {
  try {
    return await serverApiRequest<EntityPageResponse>(
      `/entities/${entityId}/page?locale=${SSR_CONTENT_LOCALE}`
    );
  } catch {
    // Build-time prerendering and transient API outages must not break the route:
    // the view falls back to client-side fetching.
    return null;
  }
}

export async function generateMetadata({ params }: EntityPageRouteProps): Promise<Metadata> {
  const { entityId } = await params;

  try {
    const pageData = await serverApiRequest<EntityPageResponse>(
      `/entities/${entityId}/page?locale=${SSR_CONTENT_LOCALE}`
    );
    const pageUrl = buildEntityShareUrl(entityId);
    const ogImage = buildEntityOgImageUrl(entityId);
    const trustPercent = Math.round(pageData.trust.confidence * 100);

    return {
      alternates: {
        canonical: pageUrl
      },
      description: `${pageData.entity.title}: ${pageData.rating.avgScore.toFixed(1)}/5, ${trustPercent}% trust, ${pageData.meta.reviewsCountGlobal} reviews on Opinia.`,
      openGraph: {
        description: `${pageData.rating.avgScore.toFixed(1)}/5 · ${trustPercent}% trust · ${pageData.meta.reviewsCountGlobal} reviews`,
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

interface EntityJsonLd {
  readonly [key: string]: unknown;
}

function buildEntityJsonLd(pageData: EntityPageResponse, pageUrl: string): EntityJsonLd {
  const aggregateRating = pageData.rating.votesCount > 0
    ? {
        "@type": "AggregateRating",
        bestRating: "5",
        ratingCount: pageData.rating.votesCount,
        ratingValue: pageData.rating.avgScore.toFixed(1),
        worstRating: "1"
      }
    : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "ItemPage",
    mainEntity: {
      "@type": "Product",
      aggregateRating,
      description: pageData.entity.description ?? undefined,
      image: pageData.entity.logoUrl ?? undefined,
      name: pageData.entity.title,
      url: pageData.entity.canonicalUrl ?? undefined
    },
    name: pageData.entity.title,
    url: pageUrl
  };
}

function serializeJsonLd(value: EntityJsonLd): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export default async function EntityPageRoute({ params }: EntityPageRouteProps) {
  const { entityId } = await params;
  const entityPage = await fetchEntityPage(entityId);
  const jsonLd = entityPage ? serializeJsonLd(buildEntityJsonLd(entityPage, buildEntityShareUrl(entityId))) : null;

  return (
    <main className="shell entity-route">
      {jsonLd ? <script dangerouslySetInnerHTML={{ __html: jsonLd }} type="application/ld+json" /> : null}
      <Suspense fallback={null}>
        <EntityPageView entityId={entityId} initialEntityPage={entityPage} />
      </Suspense>
    </main>
  );
}
