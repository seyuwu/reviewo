"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

import { useAuthSession } from "../features/auth/hooks/use-auth-session";
import { isGamesModePath } from "../features/games/lib/games-mode";
import { LocaleSwitcher } from "../features/i18n/locale-switcher";
import { useTranslation } from "../features/i18n/locale-provider";
import { HeaderActivityNav } from "./header-activity-nav";
import { HeaderGamesNav } from "./header-games-nav";
import { SiteFooter } from "./site-footer";
import { VerticalModeSwitch } from "./vertical-mode-switch";

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
  const isGamesMode = isGamesModePath(pathname);

  return (
    <div className="app-layout">
      <header className="app-chrome">
        <div className="app-chrome-inner">
          <div className="app-chrome-brand">
            <VerticalModeSwitch mode={isGamesMode ? "games" : "opinia"} />
            <Link className="app-brand" href="/">
              {t("brand.name")}
            </Link>
          </div>

          <div className="app-chrome-main">
            {isGamesMode ? <HeaderGamesNav /> : <HeaderActivityNav />}
          </div>

          <div className="app-chrome-tools">
            <LocaleSwitcher />
            <div className="app-chrome-auth" data-state={authNavState}>
              <div className="app-chrome-auth-cluster guest-cluster">
                <Link className="app-nav-cta" href="/profile">
                  {t("web.nav.signIn")}
                </Link>
              </div>
              <div className="app-chrome-auth-cluster signed-in-cluster">
                <Link className="app-nav-link" href="/profile" title={authSession?.displayName ?? t("web.nav.account")}>
                  {t("web.nav.profile")}
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
