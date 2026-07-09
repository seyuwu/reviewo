import type { Metadata } from "next";
import { Suspense } from "react";

import { TopsHubView } from "../../features/tops/components/tops-hub-view";
import {
  fetchRecentTopsServer,
  fetchTopCategoriesServer,
  parseTopListSort
} from "../../features/tops/api/server-tops-api";

export const metadata: Metadata = {
  description: "User-curated ranked lists on Opinia.",
  title: "User tops | Opinia"
};

interface UserTopsHubPageProps {
  searchParams: Promise<{ q?: string; sort?: string }>;
}

export default async function UserTopsHubPage({ searchParams }: UserTopsHubPageProps) {
  const resolvedSearchParams = await searchParams;
  const sort = parseTopListSort(resolvedSearchParams.sort);
  const searchQuery = resolvedSearchParams.q?.trim() ?? "";
  const [response, categoriesResponse] = await Promise.all([
    fetchRecentTopsServer(20, sort, searchQuery || undefined),
    fetchTopCategoriesServer()
  ]);

  return (
    <main className="shell shell-home">
      <Suspense fallback={null}>
        <TopsHubView
          categories={categoriesResponse?.items ?? []}
          initialItems={response?.items}
          initialSearchQuery={searchQuery}
          initialSort={sort}
        />
      </Suspense>
    </main>
  );
}
