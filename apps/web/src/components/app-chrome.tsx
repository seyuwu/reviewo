"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";

import { useAuthSession } from "../features/auth/hooks/use-auth-session";
import {
  DOTA_PROFILE_CINEMATIC_ARRIVED_EVENT,
  DOTA_PROFILE_CREATED_EVENT,
  type DotaProfileCreatedEventDetail,
  useMyDotaProfileNav
} from "../features/dota/hooks/use-my-dota-profile-nav";
import { NotificationToastsHost } from "../features/games/components/notification-toasts";
import { useGamesLaunchStatus } from "../features/games/hooks/use-games-launch-status";
import { isGamesModePath, isGamesProductMode } from "../features/games/lib/games-mode";
import { NotificationToastsProvider } from "../features/games/lib/use-notification-toasts";
import { LocaleSwitcher } from "../features/i18n/locale-switcher";
import { useTranslation } from "../features/i18n/locale-provider";
import { usePartyNotifications } from "../features/social/hooks/use-party-notifications";
import { HeaderActivityNav } from "./header-activity-nav";
import { HeaderChromeSearch } from "./header-chrome-search";
import { HeaderGamesNav } from "./header-games-nav";
import { HeaderNotifications } from "./header-notifications";
import { HeaderRostersMenu } from "./header-rosters-menu";
import { HeaderStatusIndicators } from "./header-status-indicators";
import { ProductBrandSwitcher } from "./product-brand-switcher";
import { SiteFooter } from "./site-footer";

interface AppChromeProps {
  children: ReactNode;
}

function PartyNotificationsBridge() {
  usePartyNotifications();
  return null;
}

export function AppChrome({ children }: AppChromeProps) {
  const pathname = usePathname();
  const { authSession, isAuthSessionLoaded, signOut } = useAuthSession();
  const profileNav = useMyDotaProfileNav();
  const { status: gamesLaunchStatus } = useGamesLaunchStatus();
  const t = useTranslation();
  const [hostname, setHostname] = useState("");
  const [cinematicProfileFlight, setCinematicProfileFlight] = useState(false);
  const [cinematicChromeRevealed, setCinematicChromeRevealed] = useState(false);
  const [showCinematicCreatedBadge, setShowCinematicCreatedBadge] = useState(false);

  useEffect(() => {
    setHostname(window.location.hostname);
  }, []);

  useEffect(() => {
    let badgeTimeout: number | null = null;

    function handleProfileCreated(event: Event) {
      const detail = (event as CustomEvent<DotaProfileCreatedEventDetail>).detail;

      if (detail?.cinematic) {
        setCinematicProfileFlight(true);
      }
    }

    function handleCinematicArrived() {
      setCinematicProfileFlight(false);
      setCinematicChromeRevealed(true);
      setShowCinematicCreatedBadge(true);
      badgeTimeout = window.setTimeout(() => {
        setShowCinematicCreatedBadge(false);
      }, 1500);
    }

    window.addEventListener(DOTA_PROFILE_CREATED_EVENT, handleProfileCreated);
    window.addEventListener(DOTA_PROFILE_CINEMATIC_ARRIVED_EVENT, handleCinematicArrived);

    return () => {
      if (badgeTimeout !== null) {
        window.clearTimeout(badgeTimeout);
      }
      window.removeEventListener(DOTA_PROFILE_CREATED_EVENT, handleProfileCreated);
      window.removeEventListener(DOTA_PROFILE_CINEMATIC_ARRIVED_EVENT, handleCinematicArrived);
    };
  }, []);

  useEffect(() => {
    if (pathname !== "/games/search" && !pathname.startsWith("/games/search/")) {
      setCinematicProfileFlight(false);
      setCinematicChromeRevealed(false);
      setShowCinematicCreatedBadge(false);
    }
  }, [pathname]);

  if (pathname.startsWith("/embed")) {
    return <>{children}</>;
  }

  const isGamesMode = isGamesProductMode(pathname, hostname);
  const mode = isGamesMode ? "games" : "opinia";
  const authNavState = !isAuthSessionLoaded ? "loading" : authSession ? "signed-in" : "guest";
  const accountHref = isGamesMode ? profileNav.href : "/profile";
  const signInNext = isGamesModePath(pathname) ? pathname : "/games/search";
  const signInHref = isGamesMode
    ? `/profile?next=${encodeURIComponent(signInNext)}`
    : "/profile";
  const isGamesSearch = pathname === "/games/search" || pathname.startsWith("/games/search/");
  const hideChromeForCinematic =
    isGamesSearch &&
    gamesLaunchStatus.searchLive &&
    ((!profileNav.isLoading && !profileNav.hasProfile) || cinematicProfileFlight);

  return (
    <NotificationToastsProvider>
      <PartyNotificationsBridge />
      <div className="app-layout" data-product={mode}>
        <header
          aria-hidden={hideChromeForCinematic}
          className={`app-chrome${
            hideChromeForCinematic
              ? " app-chrome--cinematic-hidden"
              : cinematicChromeRevealed
                ? " app-chrome--cinematic-revealed"
                : ""
          }`}
          inert={hideChromeForCinematic ? true : undefined}
        >
          <div
            className={
              isGamesMode ? "app-chrome-inner app-chrome-inner--games" : "app-chrome-inner app-chrome-inner--opinia"
            }
          >
            <div className="app-chrome-brand">
              <ProductBrandSwitcher mode={mode} />
            </div>

            <div className="app-chrome-main">
              {isGamesMode ? <HeaderGamesNav /> : <HeaderActivityNav />}
            </div>

            {isGamesMode ? null : (
              <div className="app-chrome-search-slot">
                <HeaderChromeSearch />
              </div>
            )}

            <div className="app-chrome-tools">
              {isGamesMode ? <HeaderRostersMenu /> : null}
              <HeaderNotifications />
              {isGamesMode ? null : <HeaderStatusIndicators />}
              <LocaleSwitcher />
              <div className="app-chrome-auth" data-state={authNavState}>
                <div className="app-chrome-auth-cluster guest-cluster">
                  <Link className="app-nav-cta" href={signInHref}>
                    {t("web.nav.signIn")}
                  </Link>
                </div>
                <div className="app-chrome-auth-cluster signed-in-cluster">
                  <Link
                    className={`app-chrome-user${
                      showCinematicCreatedBadge
                        ? " app-chrome-nav-link--cinematic-arrived"
                        : ""
                    }`}
                    data-cinematic-profile-target={isGamesMode ? true : undefined}
                    href={accountHref}
                    title={authSession?.displayName ?? t("web.nav.account")}
                  >
                    <span className="app-chrome-user-avatar" aria-hidden="true">
                      {authSession?.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img alt="" className="app-chrome-user-avatar-image" src={authSession.avatarUrl} />
                      ) : (
                        resolveUserInitial(authSession?.displayName)
                      )}
                    </span>
                    <span className="app-chrome-user-name">
                      {authSession?.displayName ?? t("web.nav.profile")}
                    </span>
                    {showCinematicCreatedBadge ? (
                      <span className="app-chrome-nav-created-badge">
                        {t("games.search.cinematic.createdBadge")}
                      </span>
                    ) : null}
                  </Link>
                  <button className="app-nav-button" onClick={signOut} type="button">
                    {t("web.nav.signOut")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </header>
        {children}
        <SiteFooter />
        <NotificationToastsHost />
      </div>
    </NotificationToastsProvider>
  );
}

function resolveUserInitial(displayName: string | undefined): string {
  const trimmed = displayName?.trim();

  if (!trimmed) {
    return "?";
  }

  return trimmed.slice(0, 1).toUpperCase();
}
