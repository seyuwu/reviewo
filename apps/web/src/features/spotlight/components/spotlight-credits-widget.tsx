"use client";

import { useQuery } from "@tanstack/react-query";

import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { useTranslation } from "../../i18n/locale-provider";
import { fetchMySpotlightCredits } from "../api/spotlight-api";

export function SpotlightCreditsWidget() {
  const t = useTranslation();
  const { authSession, isAuthSessionLoaded } = useAuthSession();
  const accessToken = authSession?.accessToken;

  const creditsQuery = useQuery({
    enabled: Boolean(accessToken),
    queryFn: () => fetchMySpotlightCredits(accessToken ?? ""),
    queryKey: ["spotlight-credits", accessToken]
  });

  if (!isAuthSessionLoaded || !accessToken) {
    return null;
  }

  const credits = creditsQuery.data;

  if (!credits) {
    return null;
  }

  return (
    <aside className="spotlight-credits-widget panel-card">
      <p className="spotlight-credits-widget-balance">
        {t("web.spotlight.creditsBalance", { balance: String(credits.balance) })}
      </p>
      <p className="muted-copy spotlight-credits-widget-grant">
        {t("web.spotlight.creditsGrant", { grant: String(credits.monthlyGrant) })}
      </p>
      <p className="muted-copy spotlight-credits-widget-active">
        {t("web.spotlight.creditsActivePlacements", {
          active: String(credits.activePlacements),
          max: String(credits.maxActivePlacements)
        })}
      </p>
    </aside>
  );
}
