import type { Metadata } from "next";
import { Suspense } from "react";

import { TopsPageView } from "../../features/discovery/components/tops-page-view";
import { fetchTopRatingsServer } from "../../features/discovery/api/server-discovery-api";
import { fetchSystemTopsCatalogServer } from "../../features/tops/api/server-tops-api";

export const metadata: Metadata = {
  description: "Best services by community ratings.",
  title: "Top picks | Opinia"
};

export default async function TopPage() {
  const [topResponse, catalogResponse] = await Promise.all([
    fetchTopRatingsServer("votes", 20),
    fetchSystemTopsCatalogServer()
  ]);
  const initialItems = topResponse?.items ?? [];
  const initialCatalog = catalogResponse?.items ?? [];

  return (
    <main className="shell shell-home">
      <Suspense fallback={null}>
        <TopsPageView
          initialCatalog={initialCatalog}
          initialItems={initialItems}
          initialSort="votes"
        />
      </Suspense>
    </main>
  );
}
