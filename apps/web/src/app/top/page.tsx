import type { Metadata } from "next";
import { Suspense } from "react";

import { TopsPageView } from "../../features/discovery/components/tops-page-view";
import { fetchTopRatingsServer } from "../../features/discovery/api/server-discovery-api";

export const metadata: Metadata = {
  description: "Best services by community ratings.",
  title: "Top picks | Opinia"
};

export default async function TopPage() {
  const topResponse = await fetchTopRatingsServer("all", 20);
  const initialItems = topResponse?.items ?? [];

  return (
    <main className="shell shell-home">
      <Suspense fallback={null}>
        <TopsPageView initialItems={initialItems} initialWindow="all" />
      </Suspense>
    </main>
  );
}
