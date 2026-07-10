import type { Metadata } from "next";

import { SpotlightPageView } from "../../features/spotlight/components/spotlight-page-view";
import { fetchSpotlightFeedServer } from "../../features/spotlight/api/server-spotlight-api";
import { resolveServerContentLocale } from "../../features/i18n/server-content-locale";

export const metadata: Metadata = {
  description: "Community recommendations powered by earned spotlight credits.",
  title: "Рекомендации сообщества | Opinia"
};

export default async function SpotlightPage() {
  const contentLocale = await resolveServerContentLocale();
  const initialData = await fetchSpotlightFeedServer(30, contentLocale);

  return (
    <main className="shell shell-home shell-spotlight">
      <SpotlightPageView initialContentLocale={contentLocale} initialData={initialData} />
    </main>
  );
}
