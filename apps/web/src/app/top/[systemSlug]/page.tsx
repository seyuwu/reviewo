import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SystemTopPageView } from "../../../features/tops/components/system-top-page-view";
import { fetchSystemTopBySlugServer } from "../../../features/tops/api/server-tops-api";

interface SystemTopPageProps {
  params: Promise<{ systemSlug: string }>;
}

export async function generateMetadata({ params }: SystemTopPageProps): Promise<Metadata> {
  const { systemSlug } = await params;
  const top = await fetchSystemTopBySlugServer(systemSlug);

  if (!top) {
    return {
      title: "System top | Opinia"
    };
  }

  return {
    description: top.description,
    title: `${top.title} | Opinia`
  };
}

export default async function SystemTopPage({ params }: SystemTopPageProps) {
  const { systemSlug } = await params;
  const top = await fetchSystemTopBySlugServer(systemSlug);

  if (!top) {
    notFound();
  }

  return (
    <main className="shell shell-home">
      <SystemTopPageView top={top} />
    </main>
  );
}
