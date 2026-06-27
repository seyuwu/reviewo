import { getCurrentUserWithApi } from "./auth-api.js";
import { getStoredAuthSession, saveAuthSession } from "./auth-session.js";
import { shouldApplyWebAuthToExtension } from "../shared/web-auth-sync-policy.js";

interface WebStoredAuthSession {
  accessToken?: unknown;
  displayName?: unknown;
  email?: unknown;
  userId?: unknown;
}

async function isAccessTokenValid(accessToken: string): Promise<boolean> {
  try {
    await getCurrentUserWithApi(accessToken);
    return true;
  } catch {
    return false;
  }
}

export async function syncAuthFromWebJson(rawAuthJson: string | null): Promise<void> {
  if (!rawAuthJson) {
    return;
  }

  let parsed: WebStoredAuthSession;

  try {
    parsed = JSON.parse(rawAuthJson) as WebStoredAuthSession;
  } catch {
    return;
  }

  if (typeof parsed.accessToken !== "string" || typeof parsed.displayName !== "string") {
    return;
  }

  const currentSession = await getStoredAuthSession();
  const [webTokenValid, extensionTokenValid] = await Promise.all([
    isAccessTokenValid(parsed.accessToken),
    currentSession?.accessToken
      ? isAccessTokenValid(currentSession.accessToken)
      : Promise.resolve(false)
  ]);

  if (
    !shouldApplyWebAuthToExtension({
      currentExtensionAccessToken: currentSession?.accessToken ?? null,
      extensionTokenValid,
      webAccessToken: parsed.accessToken,
      webTokenValid
    })
  ) {
    return;
  }

  let userId = typeof parsed.userId === "string" ? parsed.userId : null;

  if (!userId) {
    try {
      const user = await getCurrentUserWithApi(parsed.accessToken);
      userId = user.id;
    } catch {
      return;
    }
  }

  await saveAuthSession({
    accessToken: parsed.accessToken,
    expiresIn: 0,
    tokenType: "Bearer",
    user: {
      displayName: parsed.displayName,
      email: typeof parsed.email === "string" ? parsed.email : null,
      id: userId,
      status: "active",
      username: null
    }
  });
}
