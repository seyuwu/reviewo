"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useGamesLaunchStatus } from "../../games/hooks/use-games-launch-status";
import { useTranslation } from "../../i18n/locale-provider";
import { DotaCreateTeamForm } from "./dota-team-view";

export function DotaCreateTeamGate() {
  const t = useTranslation();
  const router = useRouter();
  const { status, isLoading } = useGamesLaunchStatus();

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!status.searchLive) {
      router.replace("/games/search");
    }
  }, [isLoading, router, status.searchLive]);

  if (isLoading) {
    return <p className="muted-copy">{t("common.loadingEllipsis")}</p>;
  }

  if (!status.searchLive) {
    return <p className="muted-copy">{t("common.loadingEllipsis")}</p>;
  }

  return <DotaCreateTeamForm />;
}
