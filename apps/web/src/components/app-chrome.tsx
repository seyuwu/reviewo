"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

import { useAuthSession } from "../features/auth/hooks/use-auth-session";
import { isGamesModePath } from "../features/games/lib/games-mode";
import { LocaleSwitcher } from "../features/i18n/locale-switcher";
import { useTranslation } from "../features/i18n/locale-provider";
import { HeaderActivityNav } from "./header-activity-nav";
import { HeaderChromeSearch } from "./header-chrome-search";
import { HeaderGamesNav } from "./header-games-nav";
import { HeaderNotifications } from "./header-notifications";
import { HeaderStatusIndicators } from "./header-status-indicators";
import { ProductBrandSwitcher } from "./product-brand-switcher";
import { SiteFooter } from "./site-footer";

interface AppChromeProps {
  children: ReactNode;
}

export function AppChrome({ children }: AppChromeProps) {
  const pathname = usePathname();
  const { authSession, isAuthSessionLoaded, signOut } = useAuthSession();
  const t = useTranslation();

  if (pathname.startsWith("/embed")) {
    return <>{children}</>;
  }

  const isGamesMode = isGamesModePath(pathname);
  const mode = isGamesMode ? "games" : "opinia";
  const authNavState = !isAuthSessionLoaded ? "loading" : authSession ? "signed-in" : "guest";

  return (
    <div className="app-layout" data-product={mode}>
      <header className="app-chrome">
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
            <HeaderNotifications />
            {isGamesMode ? null : <HeaderStatusIndicators />}
            <LocaleSwitcher />
            <div className="app-chrome-auth" data-state={authNavState}>
              <div className="app-chrome-auth-cluster guest-cluster">
                <Link className="app-nav-cta" href="/profile">
                  {t("web.nav.signIn")}
                </Link>
              </div>
              <div className="app-chrome-auth-cluster signed-in-cluster">
                <Link
                  className="app-chrome-user"
                  href="/profile"
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
    </div>
  );
}

function resolveUserInitial(displayName: string | undefined): string {
  const trimmed = displayName?.trim();

  if (!trimmed) {
    return "?";
  }

  return trimmed.charAt(0).toUpperCase();
}
