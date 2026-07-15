import type { AuthResponse, StoredAuthSession } from "../types/auth";
import { notifyWebAuthChanged, notifyWebSignOut } from "./web-auth-bridge";

const AUTH_STORAGE_KEY = "reviewo.webAuth";
export const WEB_SIGNED_OUT_KEY = "reviewo.webSignedOut";

export function getStoredAuthSession(): StoredAuthSession | null {
  if (window.localStorage.getItem(WEB_SIGNED_OUT_KEY) === "1") {
    return null;
  }

  const storedAuth = window.localStorage.getItem(AUTH_STORAGE_KEY);

  if (!storedAuth) {
    return null;
  }

  try {
    const parsed = JSON.parse(storedAuth) as StoredAuthSession;

    if (typeof parsed.accessToken !== "string" || typeof parsed.displayName !== "string") {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }

    return {
      ...parsed,
      avatarUrl: typeof parsed.avatarUrl === "string" ? parsed.avatarUrl : null
    };
  } catch {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

export function saveAuthSession(authResponse: AuthResponse): StoredAuthSession {
  const authSession: StoredAuthSession = {
    accessToken: authResponse.accessToken,
    avatarUrl: authResponse.user.avatarUrl ?? null,
    displayName: authResponse.user.displayName,
    email: authResponse.user.email,
    userId: authResponse.user.id
  };

  window.localStorage.removeItem(WEB_SIGNED_OUT_KEY);
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authSession));
  notifyWebAuthChanged();

  return authSession;
}

export function updateStoredAuthSession(
  input: Partial<Pick<StoredAuthSession, "avatarUrl" | "displayName" | "email">>
): StoredAuthSession | null {
  const currentSession = getStoredAuthSession();

  if (!currentSession) {
    return null;
  }

  const nextSession = {
    ...currentSession,
    ...input
  };

  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextSession));
  notifyWebAuthChanged();

  return nextSession;
}

export function clearAuthSession(): void {
  window.localStorage.setItem(WEB_SIGNED_OUT_KEY, "1");
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
  notifyWebSignOut();
}
