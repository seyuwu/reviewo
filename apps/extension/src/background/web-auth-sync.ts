import { getCurrentUserWithApi } from "./auth-api.js";
import { clearAuthSession, getStoredAuthSession, saveAuthSession } from "./auth-session.js";

interface WebStoredAuthSession {
  accessToken?: unknown;
  displayName?: unknown;
  email?: unknown;
  userId?: unknown;
}

export async function syncAuthFromWebJson(rawAuthJson: string | null): Promise<void> {
  if (!rawAuthJson) {
    await clearAuthSession();
    return;
  }

  let parsed: WebStoredAuthSession;

  try {
    parsed = JSON.parse(rawAuthJson) as WebStoredAuthSession;
  } catch {
    return;
  }

  if (typeof parsed.accessToken !== "string" || typeof parsed.displayName !== "string") {
    await clearAuthSession();
    return;
  }

  const currentSession = await getStoredAuthSession();

  if (
    currentSession?.accessToken === parsed.accessToken &&
    currentSession.displayName === parsed.displayName
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
