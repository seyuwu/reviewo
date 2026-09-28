import type { Metadata } from "next";

import { getDotaPublicOrigin } from "../../lib/config/product-hosts";
import { DotaBotLandingView } from "../../features/dota/components/dota-bot-landing-view";

const canonicalUrl = `${getDotaPublicOrigin()}/fdp`;
const pageTitle = "FDP — Telegram-бот для поиска пати в Dota 2";
const pageDescription =
  "Ищи пати или собирай игроков в Dota 2 через Telegram. FDP помогает подобрать команду по ролям и MMR, показывает состав и присылает уведомления.";

export const metadata: Metadata = {
  alternates: { canonical: canonicalUrl },
  description: pageDescription,
  openGraph: {
    description: pageDescription,
    siteName: "Opinia",
    title: pageTitle,
    type: "website",
    url: canonicalUrl
  },
  title: pageTitle
};

export default function FdpLandingPage() {
  return <DotaBotLandingView />;
}
