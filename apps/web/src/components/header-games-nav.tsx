"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuthSession } from "../features/auth/hooks/use-auth-session";
import { useMyDotaProfileNav } from "../features/dota/hooks/use-my-dota-profile-nav";
import { useTranslation } from "../features/i18n/locale-provider";

export function HeaderGamesNav() {
  const t = useTranslation();
  const pathname = usePathname();
  const { authSession } = useAuthSession();
  const [locationHash, setLocationHash] = useState("");
  const profileNav = useMyDotaProfileNav();
  const isDotaSection = pathname.startsWith("/dota");
  const isGamesHub = pathname === "/games" || pathname.startsWith("/games/");

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

  const isProfileActive =
    profileNav.hasProfile &&
    profileNav.slug !== null &&
    (pathname === `/dota/${profileNav.slug}` || pathname.startsWith(`/dota/${profileNav.slug}/`));

  const showCreateLink = !profileNav.isLoading && !profileNav.hasProfile;

  return (
    <nav aria-label={t("web.nav.gamesActivityAriaLabel")} className="app-activity-nav">
      <Link className={isGamesHub ? "app-activity-link is-active" : "app-activity-link"} href="/games" title={t("web.nav.gamesHub")}>
        <span aria-hidden="true" className="app-activity-icon">
          🎮
        </span>
        <span className="app-activity-copy">
          <span className="app-activity-label app-activity-label-only">{t("web.nav.gamesHub")}</span>
        </span>
      </Link>

      <Link className={isDotaSection ? "app-activity-link is-active" : "app-activity-link"} href="/dota" title={t("web.nav.dotaVertical")}>
        <span aria-hidden="true" className="app-activity-icon">
          ⚔️
        </span>
        <span className="app-activity-copy">
          <span className="app-activity-label app-activity-label-only">{t("web.nav.dotaVertical")}</span>
        </span>
      </Link>

      {isDotaSection ? (
        <>
          <Link
            className={dotaSearchLinkClass(pathname, locationHash)}
            href="/dota#dota-account-id-search"
            title={t("web.nav.dotaSearch")}
          >
            <SearchNavIcon />
            <span className="app-activity-copy">
              <span className="app-activity-label app-activity-label-only">{t("web.nav.dotaSearch")}</span>
            </span>
          </Link>

          {authSession && profileNav.hasProfile ? (
            <Link
              className={isProfileActive ? "app-activity-link is-active" : "app-activity-link"}
              href={profileNav.href}
              title={t("web.nav.myDotaProfile")}
            >
              <span aria-hidden="true" className="app-activity-icon">
                👤
              </span>
              <span className="app-activity-copy">
                <span className="app-activity-label app-activity-label-only">{t("web.nav.myDotaProfile")}</span>
              </span>
            </Link>
          ) : null}

          {showCreateLink ? (
            <Link className={activityLinkClass(pathname, "/dota/create")} href="/dota/create" title={t("web.nav.dotaCreate")}>
              <span aria-hidden="true" className="app-activity-icon">
                ✚
              </span>
              <span className="app-activity-copy">
                <span className="app-activity-label app-activity-label-only">{t("web.nav.dotaCreate")}</span>
              </span>
            </Link>
          ) : null}
        </>
      ) : null}
    </nav>
  );
}

function SearchNavIcon() {
  return (
    <svg aria-hidden="true" className="app-activity-icon-svg" fill="none" viewBox="0 0 20 20">
      <circle cx="8.5" cy="8.5" r="5.75" stroke="currentColor" strokeWidth="1.75" />
      <path d="M13 13l4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
    </svg>
  );
}

function dotaSearchLinkClass(pathname: string, hash: string): string {
  return pathname === "/dota" && hash === "#dota-account-id-search"
    ? "app-activity-link is-active"
    : "app-activity-link";
}

function activityLinkClass(pathname: string, href: string): string {
  const isActive = pathname === href || pathname.startsWith(`${href}/`);

  return isActive ? "app-activity-link is-active" : "app-activity-link";
}
