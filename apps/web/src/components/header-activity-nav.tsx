"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { ExtensionHeaderLink } from "../features/extension/components/extension-header-link";
import { fetchDiscoveryStats, pingSitePresence } from "../features/discovery/api/discovery-api";
import { useTranslation } from "../features/i18n/locale-provider";
import { getOrCreateVisitorId } from "../lib/site-presence";

const STATS_POLL_MS = 45_000;

export function HeaderActivityNav() {
  const t = useTranslation();
  const pathname = usePathname();
  const [locationHash, setLocationHash] = useState("");
  const [activeBattles, setActiveBattles] = useState<number | null>(null);
  const [onlineNow, setOnlineNow] = useState<number | null>(null);

  useEffect(() => {
    const syncHash = () => {
      setLocationHash(window.location.hash);
    };

    syncHash();
    window.addEventListener("hashchange", syncHash);

    return () => {
      window.removeEventListener("hashchange", syncHash);
    };
  }, [pathname]);

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
    <nav className="app-activity-nav" aria-label={t("web.nav.activityAriaLabel")}>
      <Link
        className={searchNavLinkClass(pathname, locationHash)}
        href="/#home-search"
        title={t("web.nav.search")}
      >
        <SearchNavIcon />
        <span className="app-activity-copy">
          <span className="app-activity-label app-activity-label-only">{t("web.nav.search")}</span>
        </span>
      </Link>

      <Link
        className={activityLinkClass(pathname, "/battles")}
        href="/battles"
        title={t("web.nav.battlesStatTitle", { count: formatStatValue(activeBattles) })}
      >
        <span className="app-activity-icon" aria-hidden="true">
          ⚔️
        </span>
        <span className="app-activity-copy">
          <strong className="app-activity-value">{formatStatValue(activeBattles)}</strong>
          <span className="app-activity-label">{t("web.nav.battlesShort")}</span>
        </span>
      </Link>

      <Link
        className={homeOnlineNavLinkClass(pathname, locationHash)}
        href="/"
        title={t("web.nav.onlineStatTitle", { count: formatStatValue(onlineNow) })}
      >
        <span className="app-activity-icon" aria-hidden="true">
          🔥
        </span>
        <span className="app-activity-copy">
          <strong className="app-activity-value">{formatStatValue(onlineNow)}</strong>
          <span className="app-activity-label">{t("web.nav.onlineShort")}</span>
        </span>
      </Link>

      <Link className={topsNavLinkClass(pathname)} href="/tops" title={t("web.nav.tops")}>
        <span className="app-activity-icon" aria-hidden="true">
          🏆
        </span>
        <span className="app-activity-copy">
          <span className="app-activity-label app-activity-label-only">{t("web.nav.tops")}</span>
        </span>
      </Link>

      <Link className={activityLinkClass(pathname, "/spotlight")} href="/spotlight" title={t("web.nav.spotlight")}>
        <span className="app-activity-icon" aria-hidden="true">
          💡
        </span>
        <span className="app-activity-copy">
          <span className="app-activity-label app-activity-label-only">{t("web.nav.spotlight")}</span>
        </span>
      </Link>

      <Link className={activityLinkClass(pathname, "/contribute")} href="/contribute" title={t("web.nav.contribute")}>
        <span className="app-activity-icon" aria-hidden="true">
          ✨
        </span>
        <span className="app-activity-copy">
          <span className="app-activity-label app-activity-label-only">{t("web.nav.contribute")}</span>
        </span>
      </Link>

      <ExtensionHeaderLink />
    </nav>
  );
}

function SearchNavIcon() {
  return (
    <svg
      aria-hidden="true"
      className="app-activity-icon-svg"
      fill="none"
      viewBox="0 0 20 20"
    >
      <circle cx="8.5" cy="8.5" r="5.75" stroke="currentColor" strokeWidth="1.75" />
      <path d="M13 13l4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
    </svg>
  );
}

function searchNavLinkClass(pathname: string, hash: string): string {
  return pathname === "/" && hash === "#home-search"
    ? "app-activity-link is-active"
    : "app-activity-link";
}

function homeOnlineNavLinkClass(pathname: string, hash: string): string {
  return pathname === "/" && hash !== "#home-search"
    ? "app-activity-link is-active"
    : "app-activity-link";
}

function activityLinkClass(pathname: string, href: string): string {
  const isActive = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return isActive ? "app-activity-link is-active" : "app-activity-link";
}

function topsNavLinkClass(pathname: string): string {
  const isActive =
    pathname === "/tops" ||
    pathname.startsWith("/tops/") ||
    pathname === "/top" ||
    pathname.startsWith("/top/");

  return isActive ? "app-activity-link is-active" : "app-activity-link";
}

function formatStatValue(value: number | null): string {
  if (value === null) {
    return "—";
  }

  return String(value);
}
