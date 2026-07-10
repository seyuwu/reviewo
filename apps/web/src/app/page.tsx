import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { HomeFeedView } from "../features/discovery/components/home-feed-view";
import { loadHomeFeedData } from "../features/discovery/lib/load-home-feed-data";
import { resolveServerContentLocale } from "../features/i18n/server-content-locale";

interface HomePageProps {
  searchParams: Promise<{
    q?: string;
  }>;
}

export const metadata: Metadata = {
  description: "Live discussions, battles, and services people talk about right now.",
  title: "What's happening on Opinia"
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const query = params.q?.trim();

  if (query) {
    redirect(`/search?q=${encodeURIComponent(query)}`);
  }

  const discussionLocale = await resolveServerContentLocale();
  const initialData = await loadHomeFeedData(discussionLocale);

  return (
    <main className="shell shell-home">
      <Suspense fallback={null}>
        <HomeFeedView initialData={initialData} />
      </Suspense>
    </main>
  );
}
