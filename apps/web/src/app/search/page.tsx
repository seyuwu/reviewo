import type { Metadata } from "next";
import { Suspense } from "react";

import { SearchPageView } from "../../features/home-search/components/search-page-view";

export const metadata: Metadata = {
  description: "Find a site, product, or company on Opinia.",
  title: "Search | Opinia"
};

export default function SearchPage() {
  return (
    <main className="shell shell-home">
      <Suspense fallback={null}>
        <SearchPageView />
      </Suspense>
    </main>
  );
}
