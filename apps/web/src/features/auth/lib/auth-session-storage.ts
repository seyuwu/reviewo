import type { AuthResponse, StoredAuthSession } from "../types/auth";

const AUTH_STORAGE_KEY = "reviewo.webAuth";

export function getStoredAuthSession(): StoredAuthSession | null {
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

    return parsed;
  } catch {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

export function saveAuthSession(authResponse: AuthResponse): StoredAuthSession {
  const authSession: StoredAuthSession = {
    accessToken: authResponse.accessToken,
    displayName: authResponse.user.displayName,
    email: authResponse.user.email,
    userId: authResponse.user.id
  };

  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authSession));
  window.dispatchEvent(new Event("reviewo:web-auth-changed"));

  return authSession;
}

export function clearAuthSession(): void {
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
  window.dispatchEvent(new Event("reviewo:web-auth-changed"));
}
