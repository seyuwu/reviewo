import { EntityPageView } from "../../../features/entity-page/components/entity-page-view";

interface EntityPageRouteProps {
  params: Promise<{
    entityId: string;
  }>;
}

export default async function EntityPageRoute({ params }: EntityPageRouteProps) {
  const { entityId } = await params;

  return (
    <main className="shell">
      <EntityPageView entityId={entityId} />
    </main>
  );
}
