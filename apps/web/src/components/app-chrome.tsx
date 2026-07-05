"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

import { useAuthSession } from "../features/auth/hooks/use-auth-session";
import { LocaleSwitcher } from "../features/i18n/locale-switcher";
import { useTranslation } from "../features/i18n/locale-provider";
import { SiteFooter } from "./site-footer";

interface AppChromeProps {
  children: ReactNode;
}

export function AppChrome({ children }: AppChromeProps) {
  const pathname = usePathname();
  const isEmbedRoute = pathname.startsWith("/embed");
  const { authSession, isAuthSessionLoaded, signOut } = useAuthSession();
  const t = useTranslation();

  if (isEmbedRoute) {
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
          <nav className="app-chrome-nav" aria-label={t("web.nav.ariaLabel")}>
            <div className="app-nav-segment">
              <Link className={navLinkClass(pathname, "/search")} href="/search">
                {t("web.nav.search")}
              </Link>
              <Link className={navLinkClass(pathname, "/battles")} href="/battles">
                {t("web.nav.battles")}
              </Link>
              <Link className={navLinkClass(pathname, "/top")} href="/top">
                {t("web.nav.tops")}
              </Link>
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
                  <span className="app-nav-user">{authSession?.displayName ?? t("web.nav.account")}</span>
                  <Link className="app-nav-link" href="/profile">
                    {t("web.nav.profile")}
                  </Link>
                  <button type="button" className="app-nav-button" onClick={signOut}>
                    {t("web.nav.signOut")}
                  </button>
                </div>
              </div>
            </div>
          </nav>
        </div>
      </header>
      {children}
      <SiteFooter />
    </div>
  );
}

function navLinkClass(pathname: string, href: string): string {
  const isActive = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return isActive ? "app-nav-segment-link is-active" : "app-nav-segment-link";
}
