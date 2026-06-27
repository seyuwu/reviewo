import { Suspense } from "react";

import { HomeSearch } from "../features/home-search/components/home-search";

export default function HomePage() {
  return (
    <main className="shell">
      <Suspense fallback={null}>
        <HomeSearch />
      </Suspense>
    </main>
  );
}
