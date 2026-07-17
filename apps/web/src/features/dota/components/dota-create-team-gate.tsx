"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  isGamesCommunityLive,
  useGamesLaunchStatus
} from "../../games/hooks/use-games-launch-status";
import { useTranslation } from "../../i18n/locale-provider";
import { DotaCreateTeamForm } from "./dota-team-view";

export function DotaCreateTeamGate() {
  const t = useTranslation();
  const router = useRouter();
  const { status, isLoading } = useGamesLaunchStatus();
  const communityLive = isGamesCommunityLive(status);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!communityLive) {
      router.replace("/games/community");
    }
  }, [communityLive, isLoading, router]);

  if (isLoading) {
    return <p className="muted-copy">{t("common.loadingEllipsis")}</p>;
  }

  if (!communityLive) {
    return <p className="muted-copy">{t("common.loadingEllipsis")}</p>;
  }

  return <DotaCreateTeamForm />;
}
