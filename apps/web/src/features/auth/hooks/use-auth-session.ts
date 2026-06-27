"use client";

import { useEffect, useState } from "react";

import {
  clearAuthSession,
  getStoredAuthSession,
  saveAuthSession
} from "../lib/auth-session-storage";
import { WEB_AUTH_BRIDGE_SOURCE } from "../lib/web-auth-bridge";
import type { AuthResponse, StoredAuthSession } from "../types/auth";

export function useAuthSession() {
  const [authSession, setAuthSession] = useState<StoredAuthSession | null>(null);
  const [isAuthSessionLoaded, setIsAuthSessionLoaded] = useState(false);

  useEffect(() => {
    const syncAuthSession = () => {
      setAuthSession(getStoredAuthSession());
      setIsAuthSessionLoaded(true);
    };

    const onBridgeMessage = (event: MessageEvent): void => {
      if (event.source !== window || event.origin !== window.location.origin) {
        return;
      }

      if (
        event.data?.source === WEB_AUTH_BRIDGE_SOURCE &&
        event.data?.type === "reviewo:web-auth-changed"
      ) {
        syncAuthSession();
      }
    };

    syncAuthSession();
    window.addEventListener("reviewo:web-auth-changed", syncAuthSession);
    window.addEventListener("message", onBridgeMessage);

    return () => {
      window.removeEventListener("reviewo:web-auth-changed", syncAuthSession);
      window.removeEventListener("message", onBridgeMessage);
    };
  }, []);

  function storeAuthSession(authResponse: AuthResponse): StoredAuthSession {
    const storedSession = saveAuthSession(authResponse);

    setAuthSession(storedSession);

    return storedSession;
  }

  function signOut() {
    clearAuthSession();
    setAuthSession(null);
  }

  return {
    authSession,
    isAuthSessionLoaded,
    signOut,
    storeAuthSession
  };
}
