"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuthSession } from "../features/auth/hooks/use-auth-session";
import {
  DOTA_PROFILE_CINEMATIC_ARRIVED_EVENT,
  DOTA_PROFILE_CREATED_EVENT,
  type DotaProfileCreatedEventDetail,
  useMyDotaProfileNav
} from "../features/dota/hooks/use-my-dota-profile-nav";
import { useGamesLaunchStatus } from "../features/games/hooks/use-games-launch-status";
import { useTranslation } from "../features/i18n/locale-provider";
import { OpiniaIcon } from "./opinia-icon";

export function HeaderGamesNav() {
  const t = useTranslation();
  const pathname = usePathname();
  const { authSession } = useAuthSession();
  const profileNav = useMyDotaProfileNav();
  const { status: launchStatus, isLoading: isLaunchStatusLoading } = useGamesLaunchStatus();
  const searchLive = launchStatus.searchLive;
  const isTeammateSearch = pathname === "/games/search" || pathname.startsWith("/games/search/");
  const [cinematicTargetPending, setCinematicTargetPending] = useState(false);

  useEffect(() => {
    function handleProfileCreated(event: Event) {
      const detail = (event as CustomEvent<DotaProfileCreatedEventDetail>).detail;

      if (detail?.cinematic) {
        setCinematicTargetPending(true);
      }
    }

    function handleCinematicArrived() {
      setCinematicTargetPending(false);
    }

    window.addEventListener(DOTA_PROFILE_CREATED_EVENT, handleProfileCreated);
    window.addEventListener(DOTA_PROFILE_CINEMATIC_ARRIVED_EVENT, handleCinematicArrived);

    return () => {
      window.removeEventListener(DOTA_PROFILE_CREATED_EVENT, handleProfileCreated);
      window.removeEventListener(DOTA_PROFILE_CINEMATIC_ARRIVED_EVENT, handleCinematicArrived);
    };
  }, []);

  // While status is unknown, don't assume waitlist (avoids nav flicker after going live).
  if (isLaunchStatusLoading) {
    return (
      <nav aria-label={t("web.nav.gamesActivityAriaLabel")} className="app-chrome-nav">
        <span className="muted-copy">{t("common.loadingEllipsis")}</span>
      </nav>
    );
  }
  const isGamesHub = pathname === "/games";
  const isDotaSection =
    pathname.startsWith("/dota") &&
    !pathname.startsWith("/dota/teams") &&
    pathname !== "/dota/create" &&
    !pathname.startsWith("/dota/create/");

  const isProfileActive =
    profileNav.hasProfile &&
    profileNav.slug !== null &&
    (pathname === `/dota/${profileNav.slug}` || pathname.startsWith(`/dota/${profileNav.slug}/`));

  const showCreateLink =
    !profileNav.isLoading &&
    !profileNav.hasProfile &&
    !(searchLive && isTeammateSearch);
  const showCinematicProfileSlot =
    searchLive && isTeammateSearch && !profileNav.isLoading && !profileNav.hasProfile;
  const cinematicNavHidden =
    searchLive && isTeammateSearch && (!profileNav.hasProfile || cinematicTargetPending);

  return (
    <nav
      aria-label={t("web.nav.gamesActivityAriaLabel")}
      className={`app-chrome-nav${
        cinematicNavHidden ? " app-chrome-nav--cinematic-hidden" : " app-chrome-nav--cinematic-revealed"
      }`}
    >
      {searchLive ? (
        <Link
          className={navLinkClass(isGamesHub, "games")}
          href="/games"
          title={t("web.nav.gamesHub")}
        >
          <span className="app-chrome-nav-icon app-chrome-nav-icon--games">
            <OpiniaIcon className="app-chrome-nav-icon-svg" name="gamepad" />
          </span>
          <span>{t("web.nav.gamesHub")}</span>
        </Link>
      ) : null}

      <Link
        className={navLinkClass(isTeammateSearch, "objects")}
        href="/games/search"
        title={t("web.nav.teammateSearch")}
      >
        <span className="app-chrome-nav-icon app-chrome-nav-icon--objects">
          <OpiniaIcon className="app-chrome-nav-icon-svg" name="search" />
        </span>
        <span>{t("web.nav.teammateSearch")}</span>
      </Link>

      {searchLive ? (
        <Link
          className={navLinkClass(isDotaSection, "battles")}
          href="/dota"
          title={t("web.nav.dotaVertical")}
        >
          <span className="app-chrome-nav-icon app-chrome-nav-icon--battles">
            <OpiniaIcon className="app-chrome-nav-icon-svg" name="battle" />
          </span>
          <span>{t("web.nav.dotaVertical")}</span>
        </Link>
      ) : null}

      {authSession && profileNav.hasProfile ? (
        <Link
          className={`${navLinkClass(isProfileActive, "spotlight")}${
            cinematicTargetPending ? " app-chrome-nav-link--cinematic-target" : ""
          }`}
          href={profileNav.href}
          title={t("web.nav.myDotaProfile")}
        >
          <span className="app-chrome-nav-icon app-chrome-nav-icon--spotlight">
            <OpiniaIcon className="app-chrome-nav-icon-svg" name="spotlight" />
          </span>
          <span>{t("web.nav.myDotaProfile")}</span>
        </Link>
      ) : null}

      {showCinematicProfileSlot ? (
        <span aria-hidden className="app-chrome-nav-link app-chrome-nav-profile-slot">
          <span className="app-chrome-nav-icon app-chrome-nav-icon--spotlight">
            <OpiniaIcon className="app-chrome-nav-icon-svg" name="spotlight" />
          </span>
          <span>{t("web.nav.myDotaProfile")}</span>
        </span>
      ) : null}

      {showCreateLink ? (
        <Link
          className={navLinkClass(pathname.startsWith("/dota/create"), "contribute")}
          href="/dota/create"
          title={t("web.nav.dotaCreate")}
        >
          <span className="app-chrome-nav-icon app-chrome-nav-icon--contribute">
            <OpiniaIcon className="app-chrome-nav-icon-svg" name="help" />
          </span>
          <span>{t("web.nav.dotaCreate")}</span>
        </Link>
      ) : null}
    </nav>
  );
}

function navLinkClass(isActive: boolean, tone: NavTone): string {
  return isActive
    ? `app-chrome-nav-link app-chrome-nav-link--${tone} is-active`
    : `app-chrome-nav-link app-chrome-nav-link--${tone}`;
}

type NavTone = "objects" | "games" | "battles" | "tops" | "spotlight" | "contribute";
