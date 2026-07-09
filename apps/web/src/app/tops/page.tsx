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
  searchParams: Promise<{ sort?: string }>;
}

export default async function UserTopsHubPage({ searchParams }: UserTopsHubPageProps) {
  const sort = parseTopListSort((await searchParams).sort);
  const [response, categoriesResponse] = await Promise.all([
    fetchRecentTopsServer(20, sort),
    fetchTopCategoriesServer()
  ]);

  return (
    <main className="shell shell-home">
      <Suspense fallback={null}>
        <TopsHubView
          categories={categoriesResponse?.items ?? []}
          initialItems={response?.items}
          initialSort={sort}
        />
      </Suspense>
    </main>
  );
}
