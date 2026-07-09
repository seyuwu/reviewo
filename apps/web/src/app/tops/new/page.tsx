import type { Metadata } from "next";
import { Suspense } from "react";

import { TopEditorView } from "../../../features/tops/components/top-editor-view";

export const metadata: Metadata = {
  description: "Create a curated top list on Opinia.",
  title: "Create top | Opinia"
};

export default function CreateTopPage() {
  return (
    <main className="shell shell-home">
      <Suspense fallback={null}>
        <TopEditorView mode="create" />
      </Suspense>
    </main>
  );
}
