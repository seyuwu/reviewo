"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { fetchDiscoveryStats, pingSitePresence } from "../features/discovery/api/discovery-api";
import { useTranslation } from "../features/i18n/locale-provider";
import { getOrCreateVisitorId } from "../lib/site-presence";
import { OpiniaIcon } from "./opinia-icon";

const STATS_POLL_MS = 45_000;

export function HeaderStatusIndicators() {
  const t = useTranslation();
  const [activeBattles, setActiveBattles] = useState<number | null>(null);
  const [onlineNow, setOnlineNow] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadStats() {
      try {
        const visitorId = getOrCreateVisitorId();
        const heartbeat = visitorId ? await pingSitePresence(visitorId) : null;
        const stats = await fetchDiscoveryStats();

        if (!cancelled) {
          setActiveBattles(stats.activeBattles);
          setOnlineNow(Math.max(stats.onlineNow, heartbeat?.onlineNow ?? 0));
        }
      } catch {
        // Keep previous values on transient failures.
      }
    }

    void loadStats();
    const intervalId = window.setInterval(() => {
      void loadStats();
    }, STATS_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <div className="app-chrome-status" aria-label={t("web.nav.activityAriaLabel")}>
      <Link
        className="app-chrome-status-link"
        href="/"
        title={t("web.nav.onlineStatTitle", { count: formatStatValue(onlineNow) })}
      >
        <span className="app-chrome-status-icon app-chrome-status-icon--hot" aria-hidden="true">
          <OpiniaIcon name="fire" />
        </span>
        <span className="app-chrome-status-value">{formatStatValue(onlineNow)}</span>
      </Link>

      <Link
        className="app-chrome-status-link"
        href="/battles"
        title={t("web.nav.battlesStatTitle", { count: formatStatValue(activeBattles) })}
      >
        <span className="app-chrome-status-icon app-chrome-status-icon--battles" aria-hidden="true">
          <OpiniaIcon name="trophy" />
        </span>
        <span className="app-chrome-status-value">{formatStatValue(activeBattles)}</span>
      </Link>
    </div>
  );
}

function formatStatValue(value: number | null): string {
  if (value === null) {
    return "—";
  }

  return String(value);
}
