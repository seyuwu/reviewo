import Link from "next/link";
import { notFound } from "next/navigation";

import { serverApiRequest } from "../../../../lib/api/server-api-client";
import type { EntityPageResponse } from "../../../../features/entity-page/types/entity-page";
import {
  formatScoreOneDecimal,
  formatStarRating,
  formatTrustPercent
} from "../../../../features/growth/lib/format-growth-stats";

interface EmbedEntityPageProps {
  params: Promise<{
    entityId: string;
  }>;
}

export default async function EmbedEntityPage({ params }: EmbedEntityPageProps) {
  const { entityId } = await params;

  try {
    const pageData = await serverApiRequest<EntityPageResponse>(`/entities/${entityId}/page`);

    return (
      <main className="embed-shell">
        <article className="embed-card">
          <h1 className="embed-card-title">{pageData.entity.title}</h1>
          <p className="embed-card-meta">
            <span aria-hidden="true">{formatStarRating(pageData.rating.avgScore)}</span>{" "}
            {formatScoreOneDecimal(pageData.rating.avgScore)}/5 ·{" "}
            {formatTrustPercent(pageData.trust.confidence)} trust
          </p>
          <p className="embed-card-brand">
            <Link href={`/entities/${entityId}`} target="_top">
              Powered by Opinia
            </Link>
          </p>
        </article>
      </main>
    );
  } catch {
    notFound();
  }
}

export const metadata = {
  robots: {
    index: false
  },
  title: "Opinia Embed"
};
