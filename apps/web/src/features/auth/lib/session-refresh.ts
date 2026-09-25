import { publicEnv } from "../../../lib/config/public-env";
import { clearAuthSession, getStoredAuthSession, saveAuthSession } from "./auth-session-storage";
import type { AuthResponse } from "../types/auth";

let refreshInFlight: Promise<string | null> | null = null;

/**
 * Called by apiRequest when a request returns 401. Exchanges the stored refresh
 * token for a fresh access token. Single-flight: concurrent 401s share one
 * refresh round-trip. Returns the new access token, or null when the session
 * cannot be recovered.
 */
export function refreshAccessToken(): Promise<string | null> {
  refreshInFlight ??= performRefresh().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

async function performRefresh(retryCount = 0): Promise<string | null> {
  const session = getStoredAuthSession();

  if (!session) {
    return null;
  }

  if (!session.refreshToken) {
    clearAuthSession();
    return null;
  }

  return exchangeRefreshToken(session.refreshToken, retryCount);
}

async function exchangeRefreshToken(refreshToken: string, retryCount: number): Promise<string | null> {
  try {
    const response = await fetch(new URL("/auth/refresh", publicEnv.apiBaseUrl), {
      body: JSON.stringify({ refreshToken }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });

    if (!response.ok) {
      if (response.status === 401 && retryCount === 0) {
        const rotatedToken = await waitForRotatedRefreshToken(refreshToken);

        if (rotatedToken) {
          return exchangeRefreshToken(rotatedToken, retryCount + 1);
        }
      }

      if (response.status === 401) {
        clearAuthSession();
      }
      return null;
    }

    const authResponse = (await response.json()) as AuthResponse;
    saveAuthSession(authResponse);

    return authResponse.accessToken;
  } catch {
    // Network failure: keep the session so the next request can retry the refresh.
    return null;
  }
}

async function waitForRotatedRefreshToken(previousToken: string): Promise<string | null> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 100));
    const currentSession = getStoredAuthSession();

    if (currentSession?.refreshToken && currentSession.refreshToken !== previousToken) {
      return currentSession.refreshToken;
    }
  }

  return null;
}
