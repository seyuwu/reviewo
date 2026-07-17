"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";

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

const STATUS_CACHE_KEY = "opinia.games.launchStatus.v1";

function readCachedStatus(): GamesLaunchStatus | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(STATUS_CACHE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<GamesLaunchStatus>;

    if (typeof parsed.searchLive !== "boolean" || typeof parsed.launchAt !== "string") {
      return null;
    }

    return {
      averageMmr: typeof parsed.averageMmr === "string" ? parsed.averageMmr : null,
      devNoteLikeCount:
        typeof parsed.devNoteLikeCount === "number" ? parsed.devNoteLikeCount : 0,
      devNoteLiked: Boolean(parsed.devNoteLiked),
      launchAt: parsed.launchAt || FALLBACK_STATUS.launchAt,
      searchLive: parsed.searchLive,
      waitingCount: typeof parsed.waitingCount === "number" ? parsed.waitingCount : 0
    };
  } catch {
    return null;
  }
}

function writeCachedStatus(status: GamesLaunchStatus): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(STATUS_CACHE_KEY, JSON.stringify(status));
  } catch {
    /* ignore quota / private mode */
  }
}

export function useGamesLaunchStatus(): {
  isLoading: boolean;
  refresh: () => Promise<void>;
  status: GamesLaunchStatus;
  setStatus: (next: GamesLaunchStatus | ((current: GamesLaunchStatus) => GamesLaunchStatus)) => void;
} {
  const { authSession } = useAuthSession();
  // Always start unknown — never paint waitlist from the false fallback before the API answers.
  const [status, setStatusState] = useState<GamesLaunchStatus>(FALLBACK_STATUS);
  const [isLoading, setIsLoading] = useState(true);

  const setStatus = useCallback(
    (next: GamesLaunchStatus | ((current: GamesLaunchStatus) => GamesLaunchStatus)) => {
      setStatusState((current) => {
        const resolved = typeof next === "function" ? next(current) : next;
        writeCachedStatus(resolved);
        return resolved;
      });
    },
    []
  );

  const refresh = useCallback(async () => {
    try {
      const accessToken = authSession?.accessToken ?? null;
      const voterKey = accessToken ? null : getOrCreateVisitorId();
      const next = await fetchGamesLaunchStatus({
        accessToken,
        voterKey
      });
      const resolved: GamesLaunchStatus = {
        averageMmr: next.averageMmr ?? null,
        devNoteLikeCount: next.devNoteLikeCount ?? 0,
        devNoteLiked: Boolean(next.devNoteLiked),
        launchAt: next.launchAt || FALLBACK_STATUS.launchAt,
        searchLive: Boolean(next.searchLive),
        waitingCount: next.waitingCount ?? 0
      };
      writeCachedStatus(resolved);
      setStatusState(resolved);
    } catch {
      const cached = readCachedStatus();
      if (cached) {
        setStatusState(cached);
      } else {
        setStatusState(FALLBACK_STATUS);
      }
    } finally {
      setIsLoading(false);
    }
  }, [authSession?.accessToken]);

  // Optimistic live from session cache only — never optimistic waitlist (stale false flashes UI).
  useLayoutEffect(() => {
    const cached = readCachedStatus();
    if (cached?.searchLive) {
      setStatusState(cached);
      setIsLoading(false);
    }
  }, []);

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
