import type { Metadata } from "next";
import { Suspense } from "react";

import { DotaCreateForm } from "../../../features/dota/components/dota-create-form";

export const metadata: Metadata = {
  description: "Создайте Dota-профиль с подтверждениями от тиммейтов.",
  title: "Создать Dota-профиль | Opinia"
};

export default function DotaCreatePage() {
  return (
    <main className="shell entity-route">
      <Suspense fallback={null}>
        <DotaCreateForm />
      </Suspense>
    </main>
  );
}
