"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

import { useAuthSession } from "../features/auth/hooks/use-auth-session";
import { LocaleSwitcher } from "../features/i18n/locale-switcher";
import { useTranslation } from "../features/i18n/locale-provider";
import { HeaderActivityNav } from "./header-activity-nav";
import { HeaderChromeSearch } from "./header-chrome-search";
import { HeaderNotifications } from "./header-notifications";
import { HeaderStatusIndicators } from "./header-status-indicators";
import { OpiniaIcon } from "./opinia-icon";
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

  const authNavState = !isAuthSessionLoaded ? "loading" : authSession ? "signed-in" : "guest";

  return (
    <div className="app-layout">
      <header className="app-chrome">
        <div className="app-chrome-inner app-chrome-inner--opinia">
          <div className="app-chrome-brand">
            <Link className="app-brand" href="/">
              <span className="app-brand-mark" aria-hidden="true">
                <OpiniaIcon name="sparkle" />
              </span>
              {t("brand.name")}
            </Link>
          </div>

          <div className="app-chrome-main">
            <HeaderActivityNav />
          </div>

          <div className="app-chrome-search-slot">
            <HeaderChromeSearch />
          </div>

          <div className="app-chrome-tools">
            <HeaderNotifications />
            <HeaderStatusIndicators />
            <LocaleSwitcher />
            <div className="app-chrome-auth" data-state={authNavState}>
              <div className="app-chrome-auth-cluster guest-cluster">
                <Link className="app-nav-cta" href="/profile">
                  {t("web.nav.signIn")}
                </Link>
              </div>
              <div className="app-chrome-auth-cluster signed-in-cluster">
                <Link className="app-chrome-user" href="/profile" title={authSession?.displayName ?? t("web.nav.account")}>
                  <span className="app-chrome-user-avatar" aria-hidden="true">
                    {resolveUserInitial(authSession?.displayName)}
                  </span>
                  <span className="app-chrome-user-name">{authSession?.displayName ?? t("web.nav.profile")}</span>
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
