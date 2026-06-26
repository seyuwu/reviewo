"use client";

import { useEffect, useState } from "react";

import {
  clearAuthSession,
  getStoredAuthSession,
  saveAuthSession
} from "../lib/auth-session-storage";
import type { AuthResponse, StoredAuthSession } from "../types/auth";

export function useAuthSession() {
  const [authSession, setAuthSession] = useState<StoredAuthSession | null>(null);
  const [isAuthSessionLoaded, setIsAuthSessionLoaded] = useState(false);

  useEffect(() => {
    setAuthSession(getStoredAuthSession());
    setIsAuthSessionLoaded(true);
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
