import type { Metadata } from "next";

import { ContributePageView } from "../../features/contribute/components/contribute-page-view";
import { fetchContributeQueuesServer } from "../../features/contribute/api/server-contribute-api";

export const metadata: Metadata = {
  description: "Help Opinia grow by reviewing, fixing data, and joining battles.",
  title: "Contribute | Opinia"
};

export default async function ContributePage() {
  const initialData = await fetchContributeQueuesServer(20);

  return (
    <main className="shell shell-home">
      <ContributePageView initialData={initialData} />
    </main>
  );
}
