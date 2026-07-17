import type { AuthResponse, StoredAuthSession } from "../types/auth";
import {
  clearSharedAuthSessionCookie,
  clearSharedSignedOutCookie,
  isSharedSignedOutCookie,
  readSharedAuthSessionCookie,
  writeSharedAuthSessionCookie,
  writeSharedSignedOutCookie
} from "./auth-session-cookie";
import { notifyWebAuthChanged, notifyWebSignOut } from "./web-auth-bridge";

const AUTH_STORAGE_KEY = "reviewo.webAuth";
export const WEB_SIGNED_OUT_KEY = "reviewo.webSignedOut";

/** Fallback TTL when login response does not provide expiresIn (7 days). */
const DEFAULT_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export function getStoredAuthSession(): StoredAuthSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const cookieOptions = getCookieRuntimeOptions();

  if (isSharedSignedOutCookie() || window.localStorage.getItem(WEB_SIGNED_OUT_KEY) === "1") {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    window.localStorage.setItem(WEB_SIGNED_OUT_KEY, "1");
    clearSharedAuthSessionCookie(cookieOptions);
    writeSharedSignedOutCookie(cookieOptions);
    return null;
  }

  const fromCookie = readSharedAuthSessionCookie();
  const fromLocal = readLocalAuthSession();

  if (fromCookie?.accessToken && fromCookie.userId) {
    window.localStorage.removeItem(WEB_SIGNED_OUT_KEY);
    const merged: StoredAuthSession = {
      ...fromCookie,
      // Cookie never carries avatar (size limit); keep local avatar for the same user.
      avatarUrl:
        fromLocal?.userId === fromCookie.userId && fromLocal.avatarUrl
          ? fromLocal.avatarUrl
          : fromCookie.avatarUrl
    };
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(merged));
    return merged;
  }

  if (fromLocal) {
    // Hydrate shared cookie so sibling hosts (games./dota.) can pick up this session.
    writeSharedAuthSessionCookie(fromLocal, {
      ...cookieOptions,
      maxAgeSeconds: DEFAULT_SESSION_MAX_AGE_SECONDS
    });
    return fromLocal;
  }

  return null;
}

export function saveAuthSession(
  authResponse: AuthResponse,
  options?: { maxAgeSeconds?: number }
): StoredAuthSession {
  const authSession: StoredAuthSession = {
    accessToken: authResponse.accessToken,
    avatarUrl: authResponse.user.avatarUrl ?? null,
    displayName: authResponse.user.displayName,
    email: authResponse.user.email,
    userId: authResponse.user.id
  };

  const cookieOptions = getCookieRuntimeOptions();
  const maxAgeSeconds = options?.maxAgeSeconds ?? authResponse.expiresIn ?? DEFAULT_SESSION_MAX_AGE_SECONDS;

  window.localStorage.removeItem(WEB_SIGNED_OUT_KEY);
  clearSharedSignedOutCookie(cookieOptions);
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authSession));
  writeSharedAuthSessionCookie(authSession, {
    ...cookieOptions,
    maxAgeSeconds
  });
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

  const cookieOptions = getCookieRuntimeOptions();

  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextSession));
  writeSharedAuthSessionCookie(nextSession, {
    ...cookieOptions,
    maxAgeSeconds: DEFAULT_SESSION_MAX_AGE_SECONDS
  });
  notifyWebAuthChanged();

  return nextSession;
}

export function clearAuthSession(): void {
  if (typeof window === "undefined") {
    return;
  }

  const cookieOptions = getCookieRuntimeOptions();

  window.localStorage.setItem(WEB_SIGNED_OUT_KEY, "1");
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
  clearSharedAuthSessionCookie(cookieOptions);
  writeSharedSignedOutCookie(cookieOptions);
  notifyWebSignOut();
}

function readLocalAuthSession(): StoredAuthSession | null {
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

function getCookieRuntimeOptions(): { hostname: string; secure: boolean } {
  return {
    hostname: window.location.hostname,
    secure: window.location.protocol === "https:"
  };
}
