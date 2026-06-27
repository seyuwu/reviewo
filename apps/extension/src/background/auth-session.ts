import type { ExtensionAuthResponse, ExtensionStoredAuthSession } from "../shared/types/auth.js";

const AUTH_STORAGE_KEY = "reviewo.extensionAuth";

export async function getStoredAuthSession(): Promise<ExtensionStoredAuthSession | null> {
  const storageResult = await chrome.storage.local.get(AUTH_STORAGE_KEY);
  const storedSession = storageResult[AUTH_STORAGE_KEY];

  if (!storedSession || typeof storedSession !== "object") {
    return null;
  }

  const candidate = storedSession as ExtensionStoredAuthSession;

  if (
    typeof candidate.accessToken !== "string" ||
    typeof candidate.displayName !== "string" ||
    typeof candidate.userId !== "string"
  ) {
    await clearAuthSession();
    return null;
  }

  return candidate;
}

export async function saveAuthSession(
  authResponse: ExtensionAuthResponse
): Promise<ExtensionStoredAuthSession> {
  const authSession: ExtensionStoredAuthSession = {
    accessToken: authResponse.accessToken,
    displayName: authResponse.user.displayName,
    email: authResponse.user.email,
    userId: authResponse.user.id
  };

  await chrome.storage.local.set({
    [AUTH_STORAGE_KEY]: authSession
  });

  return authSession;
}

export async function clearAuthSession(): Promise<void> {
  await chrome.storage.local.remove(AUTH_STORAGE_KEY);
}
