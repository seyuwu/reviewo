import { Suspense } from "react";

import { BackToSearchLink } from "../../../components/back-to-search-link";
import { EntityCreationForm } from "../../../features/entity-creation/components/entity-creation-form";

interface NewEntityPageProps {
  searchParams: Promise<{
    query?: string;
  }>;
}

export default async function NewEntityPage({ searchParams }: NewEntityPageProps) {
  const { query } = await searchParams;

  return (
    <main className="shell entity-route">
      <BackToSearchLink query={query} />
      <Suspense fallback={null}>
        <EntityCreationForm />
      </Suspense>
    </main>
  );
}
