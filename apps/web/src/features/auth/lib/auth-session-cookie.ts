export const SHARED_AUTH_COOKIE_NAME = "opinia.sharedAuth";
export const SHARED_SIGNED_OUT_COOKIE_NAME = "opinia.webSignedOut";

export interface SharedAuthCookieSession {
  accessToken: string;
  avatarUrl: string | null;
  displayName: string;
  email: string | null;
  userId: string;
}

/**
 * Cookie Domain for sharing web auth across OpinIA hosts.
 * Returns null when the host cannot safely share (keep origin-local storage only).
 */
export function resolveSharedAuthCookieDomain(hostname: string): string | null {
  const host = hostname.trim().toLowerCase().split(":")[0] ?? "";

  if (!host) {
    return null;
  }

  if (host === "opinia.ru" || host.endsWith(".opinia.ru")) {
    return ".opinia.ru";
  }

  if (host === "localhost" || host.endsWith(".localhost")) {
    return ".localhost";
  }

  return null;
}

export function readSharedAuthSessionCookie(
  cookieHeader: string = typeof document !== "undefined" ? document.cookie : ""
): SharedAuthCookieSession | null {
  const raw = readCookieValue(cookieHeader, SHARED_AUTH_COOKIE_NAME);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as SharedAuthCookieSession;

    if (typeof parsed.accessToken !== "string" || typeof parsed.displayName !== "string") {
      return null;
    }

    return {
      accessToken: parsed.accessToken,
      avatarUrl: typeof parsed.avatarUrl === "string" ? parsed.avatarUrl : null,
      displayName: parsed.displayName,
      email: typeof parsed.email === "string" ? parsed.email : null,
      userId: typeof parsed.userId === "string" ? parsed.userId : ""
    };
  } catch {
    return null;
  }
}

export function isSharedSignedOutCookie(
  cookieHeader: string = typeof document !== "undefined" ? document.cookie : ""
): boolean {
  return readCookieValue(cookieHeader, SHARED_SIGNED_OUT_COOKIE_NAME) === "1";
}

export function writeSharedAuthSessionCookie(
  session: SharedAuthCookieSession,
  options: {
    hostname: string;
    maxAgeSeconds: number;
    secure: boolean;
  }
): string {
  const value = encodeURIComponent(JSON.stringify(session));
  return applyCookie(SHARED_AUTH_COOKIE_NAME, value, {
    ...options,
    maxAgeSeconds: Math.max(60, options.maxAgeSeconds)
  });
}

export function clearSharedAuthSessionCookie(options: {
  hostname: string;
  secure: boolean;
}): string {
  return applyCookie(SHARED_AUTH_COOKIE_NAME, "", {
    ...options,
    maxAgeSeconds: 0
  });
}

export function writeSharedSignedOutCookie(options: {
  hostname: string;
  secure: boolean;
}): string {
  return applyCookie(SHARED_SIGNED_OUT_COOKIE_NAME, "1", {
    ...options,
    maxAgeSeconds: 60 * 60 * 24 * 400
  });
}

export function clearSharedSignedOutCookie(options: {
  hostname: string;
  secure: boolean;
}): string {
  return applyCookie(SHARED_SIGNED_OUT_COOKIE_NAME, "", {
    ...options,
    maxAgeSeconds: 0
  });
}

function applyCookie(
  name: string,
  value: string,
  options: {
    hostname: string;
    maxAgeSeconds: number;
    secure: boolean;
  }
): string {
  const domain = resolveSharedAuthCookieDomain(options.hostname);
  const parts = [
    `${name}=${value}`,
    "Path=/",
    `Max-Age=${Math.floor(options.maxAgeSeconds)}`,
    "SameSite=Lax"
  ];

  if (domain) {
    parts.push(`Domain=${domain}`);
  }

  if (options.secure) {
    parts.push("Secure");
  }

  const cookie = parts.join("; ");

  if (typeof document !== "undefined") {
    document.cookie = cookie;
  }

  return cookie;
}

function readCookieValue(cookieHeader: string, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  const prefix = `${name}=`;
  const parts = cookieHeader.split("; ");

  for (const part of parts) {
    if (part.startsWith(prefix)) {
      return part.slice(prefix.length);
    }
  }

  return null;
}
