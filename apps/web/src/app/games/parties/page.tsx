import type { Metadata } from "next";
import { AllPartiesView } from "../../../features/dota/components/all-parties-view";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AllPartiesPage() {
  return (
    <main className="shell entity-route">
      <AllPartiesView />
    </main>
  );
}
