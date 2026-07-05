import { redirect } from "next/navigation";
import { Suspense } from "react";

import { CompareQueryRedirect } from "../../features/growth/components/compare-query-redirect";

interface ComparePageProps {
  searchParams: Promise<{
    left?: string;
    right?: string;
  }>;
}

export default async function CompareByEntityIdsPage({ searchParams }: ComparePageProps) {
  const params = await searchParams;
  const left = params.left?.trim();
  const right = params.right?.trim();

  if (!left || !right) {
    redirect("/battles");
  }

  return (
    <Suspense fallback={null}>
      <CompareQueryRedirect />
    </Suspense>
  );
}
