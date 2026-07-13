import type { Metadata } from "next";

import { DotaLandingView } from "../../features/dota/components/dota-landing-view";
import { buildDotaOgImageUrl } from "../../features/dota/lib/share";

export const metadata: Metadata = {
  description: "Профиль дотера с подтверждениями от тиммейтов на Opinia.",
  openGraph: {
    images: [{ url: buildDotaOgImageUrl("dota") }],
    title: "Dota профили | Opinia"
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
