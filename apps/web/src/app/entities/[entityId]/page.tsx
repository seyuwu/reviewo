import { Suspense } from "react";

import { BackToSearchLink } from "../../../components/back-to-search-link";
import { EntityPageView } from "../../../features/entity-page/components/entity-page-view";

interface EntityPageRouteProps {
  params: Promise<{
    entityId: string;
  }>;
  searchParams: Promise<{
    q?: string;
  }>;
}

export default async function EntityPageRoute({ params, searchParams }: EntityPageRouteProps) {
  const { entityId } = await params;
  const { q } = await searchParams;

  return (
    <main className="shell entity-route">
      <BackToSearchLink query={q} />
      <Suspense fallback={null}>
        <EntityPageView entityId={entityId} />
      </Suspense>
    </main>
  );
}
