"use client";

import Link from "next/link";
import { ReactNode } from "react";

import { useAuthSession } from "../features/auth/hooks/use-auth-session";

interface AppChromeProps {
  children: ReactNode;
}

export function AppChrome({ children }: AppChromeProps) {
  const { authSession, isAuthSessionLoaded, signOut } = useAuthSession();

  const authNavState = !isAuthSessionLoaded ? "loading" : authSession ? "signed-in" : "guest";

  return (
    <div className="app-layout">
      <header className="app-chrome">
        <div className="app-chrome-inner">
          <Link className="app-brand" href="/">
            Reviewo
          </Link>
          <nav className="app-chrome-nav" aria-label="Site navigation">
            <Link className="app-nav-link app-nav-link-emphasis" href="/">
              Поиск
            </Link>
            <div className="app-chrome-auth" data-state={authNavState}>
              <div className="app-chrome-auth-cluster guest-cluster">
                <Link className="app-nav-link app-nav-link-emphasis" href="/profile">
                  Sign in
                </Link>
              </div>
              <div className="app-chrome-auth-cluster signed-in-cluster">
                <span className="app-nav-user">{authSession?.displayName ?? "Account"}</span>
                <Link className="app-nav-link" href="/profile">
                  Profile
                </Link>
                <button type="button" className="app-nav-button" onClick={signOut}>
                  Sign out
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
