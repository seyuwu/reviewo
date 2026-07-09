import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { TopsHubView } from "../../../../features/tops/components/tops-hub-view";
import {
  fetchTopCategoriesServer,
  fetchTopsByCategoryServer,
  parseTopListSort
} from "../../../../features/tops/api/server-tops-api";

interface TopsCategoryPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; sort?: string }>;
}

export async function generateMetadata({ params }: TopsCategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const categories = await fetchTopCategoriesServer();
  const category = categories?.items.find((item) => item.slug === slug);

  if (!category) {
    return {
      title: "User tops | Opinia"
    };
  }

  return {
    title: `${category.title} | Opinia`
  };
}

export default async function TopsCategoryPage({ params, searchParams }: TopsCategoryPageProps) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const sort = parseTopListSort(resolvedSearchParams.sort);
  const searchQuery = resolvedSearchParams.q?.trim() ?? "";
  const [categoriesResponse, topsResponse] = await Promise.all([
    fetchTopCategoriesServer(),
    fetchTopsByCategoryServer(slug, 20, sort, searchQuery || undefined)
  ]);
  const category = categoriesResponse?.items.find((item) => item.slug === slug);

  if (!category) {
    notFound();
  }

  return (
    <main className="shell shell-home">
      <Suspense fallback={null}>
        <TopsHubView
          activeCategorySlug={slug}
          categories={categoriesResponse?.items ?? []}
          initialItems={topsResponse?.items ?? []}
          initialSearchQuery={searchQuery}
          initialSort={sort}
        />
      </Suspense>
    </main>
  );
}
