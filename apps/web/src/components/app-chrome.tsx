"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, Suspense } from "react";

import { useAuthSession } from "../features/auth/hooks/use-auth-session";
import { LocaleSwitcher } from "../features/i18n/locale-switcher";
import { useTranslation } from "../features/i18n/locale-provider";
import { HeaderActivityNav } from "./header-activity-nav";
import { HeaderSearchBar } from "./header-search-bar";
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
        <div className="app-chrome-inner">
          <Link className="app-brand" href="/">
            {t("brand.name")}
          </Link>

          <Suspense fallback={<div className="app-chrome-search app-chrome-search-fallback" aria-hidden="true" />}>
            <HeaderSearchBar />
          </Suspense>

          <div className="app-chrome-right">
            <HeaderActivityNav />

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
                  <button type="button" className="app-nav-button" onClick={signOut}>
                    {t("web.nav.signOut")}
                  </button>
                </div>
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
