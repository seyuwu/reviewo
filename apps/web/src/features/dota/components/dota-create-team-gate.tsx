"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  isGamesCommunityLive,
  useGamesLaunchStatus
} from "../../games/hooks/use-games-launch-status";
import { useTranslation } from "../../i18n/locale-provider";
import { DotaCreateTeamForm } from "./dota-team-view";

export function DotaCreateTeamGate({
  allowClosedCommunity = false,
  tournamentSlug
}: {
  allowClosedCommunity?: boolean;
  tournamentSlug: string | undefined;
}) {
  const t = useTranslation();
  const router = useRouter();
  const { status, isLoading } = useGamesLaunchStatus();
  const communityLive = isGamesCommunityLive(status);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!communityLive && !allowClosedCommunity && !tournamentSlug) {
      router.replace("/games/community");
    }
  }, [allowClosedCommunity, communityLive, isLoading, router, tournamentSlug]);

  if (isLoading) {
    return <p className="muted-copy">{t("common.loadingEllipsis")}</p>;
  }

  if (!communityLive && !allowClosedCommunity && !tournamentSlug) {
    return <p className="muted-copy">{t("common.loadingEllipsis")}</p>;
  }

  return (
    <DotaCreateTeamForm
      tournamentEntry={allowClosedCommunity}
      tournamentSlug={tournamentSlug}
    />
  );
}
