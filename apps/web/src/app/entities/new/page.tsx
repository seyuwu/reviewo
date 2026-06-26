import { Suspense } from "react";

import { EntityCreationForm } from "../../../features/entity-creation/components/entity-creation-form";

export default function NewEntityPage() {
  return (
    <main className="shell">
      <Suspense fallback={null}>
        <EntityCreationForm />
      </Suspense>
    </main>
  );
}
