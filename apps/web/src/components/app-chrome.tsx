"use client";

import Link from "next/link";
import { ReactNode } from "react";

import { useAuthSession } from "../features/auth/hooks/use-auth-session";
import { LocaleSwitcher } from "../features/i18n/locale-switcher";
import { useTranslation } from "../features/i18n/locale-provider";

interface AppChromeProps {
  children: ReactNode;
}

export function AppChrome({ children }: AppChromeProps) {
  const { authSession, isAuthSessionLoaded, signOut } = useAuthSession();
  const t = useTranslation();

  const authNavState = !isAuthSessionLoaded ? "loading" : authSession ? "signed-in" : "guest";

  return (
    <div className="app-layout">
      <header className="app-chrome">
        <div className="app-chrome-inner">
          <Link className="app-brand" href="/">
            {t("brand.name")}
          </Link>
          <nav className="app-chrome-nav" aria-label={t("web.nav.ariaLabel")}>
            <Link className="app-nav-link app-nav-link-emphasis" href="/">
              {t("web.nav.search")}
            </Link>
            <LocaleSwitcher />
            <div className="app-chrome-auth" data-state={authNavState}>
              <div className="app-chrome-auth-cluster guest-cluster">
                <Link className="app-nav-link app-nav-link-emphasis" href="/profile">
                  {t("web.nav.signIn")}
                </Link>
              </div>
              <div className="app-chrome-auth-cluster signed-in-cluster">
                <span className="app-nav-user">{authSession?.displayName ?? t("web.nav.account")}</span>
                <Link className="app-nav-link" href="/profile">
                  {t("web.nav.profile")}
                </Link>
                <button type="button" className="app-nav-button" onClick={signOut}>
                  {t("web.nav.signOut")}
                </button>
              </div>
            </div>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
