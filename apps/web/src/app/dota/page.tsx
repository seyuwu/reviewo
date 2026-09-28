import type { Metadata } from "next";

import { getDotaPublicOrigin } from "../../lib/config/product-hosts";
import { DotaLandingView } from "../../features/dota/components/dota-landing-view";
import { buildDotaOgImageUrl } from "../../features/dota/lib/share";

const canonicalUrl = `${getDotaPublicOrigin()}/dota`;

export const metadata: Metadata = {
  alternates: { canonical: canonicalUrl },
  description: "Профиль дотера с подтверждениями от тиммейтов на Opinia.",
  openGraph: {
    images: [{ url: buildDotaOgImageUrl("dota") }],
    title: "Dota профили | Opinia",
    url: canonicalUrl
  },
  title: "Dota профили | Opinia"
};

export default function DotaLandingPage() {
  return (
    <main className="shell shell-home">
      <DotaLandingView />
    </main>
  );
}
