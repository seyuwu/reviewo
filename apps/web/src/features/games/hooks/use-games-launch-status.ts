"use client";

import { useCallback, useEffect, useState } from "react";

import { getOrCreateVisitorId } from "../../../lib/site-presence";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import {
  fetchGamesLaunchStatus,
  type GamesLaunchStatus
} from "../api/games-launch-api";

const FALLBACK_STATUS: GamesLaunchStatus = {
  averageMmr: null,
  devNoteLikeCount: 0,
  devNoteLiked: false,
  launchAt: "2026-07-19T16:00:00.000Z",
  searchLive: false,
  waitingCount: 0
};

export function useGamesLaunchStatus(): {
  isLoading: boolean;
  refresh: () => Promise<void>;
  status: GamesLaunchStatus;
  setStatus: (next: GamesLaunchStatus | ((current: GamesLaunchStatus) => GamesLaunchStatus)) => void;
} {
  const { authSession } = useAuthSession();
  const [status, setStatus] = useState<GamesLaunchStatus>(FALLBACK_STATUS);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const accessToken = authSession?.accessToken ?? null;
      const voterKey = accessToken ? null : getOrCreateVisitorId();
      const next = await fetchGamesLaunchStatus({
        accessToken,
        voterKey
      });
      setStatus({
        averageMmr: next.averageMmr ?? null,
        devNoteLikeCount: next.devNoteLikeCount ?? 0,
        devNoteLiked: Boolean(next.devNoteLiked),
        launchAt: next.launchAt || FALLBACK_STATUS.launchAt,
        searchLive: Boolean(next.searchLive),
        waitingCount: next.waitingCount ?? 0
      });
    } catch {
      setStatus(FALLBACK_STATUS);
    } finally {
      setIsLoading(false);
    }
  }, [authSession?.accessToken]);

  useEffect(() => {
    void refresh();

    function onFocus(): void {
      void refresh();
    }

    function onVisibility(): void {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    }

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  return { isLoading, refresh, setStatus, status };
}
