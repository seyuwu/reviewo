import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { TopPageView } from "../../../features/tops/components/top-page-view";
import { fetchTopBySlugServer } from "../../../features/tops/api/server-tops-api";

interface TopDetailPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: TopDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const top = await fetchTopBySlugServer(slug);

  if (!top) {
    return {
      title: "Top not found | Opinia"
    };
  }

  return {
    description: top.description ?? `Curated top: ${top.title}`,
    title: `${top.title} | Opinia`
  };
}

export default async function TopDetailPage({ params }: TopDetailPageProps) {
  const { slug } = await params;
  const top = await fetchTopBySlugServer(slug);

  if (!top) {
    notFound();
  }

  return (
    <main className="shell shell-home">
      <TopPageView top={top} />
    </main>
  );
}
