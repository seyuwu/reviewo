export const SITE_SNOOZE_STORAGE_KEY = "reviewo.siteSnoozes";

export type SiteSnoozeDuration = "24h" | "30d" | "1y" | "7d";

const SITE_SNOOZE_DURATION_MS: Record<SiteSnoozeDuration, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "1y": 365 * 24 * 60 * 60 * 1000
};

export const SITE_SNOOZE_DURATIONS = Object.keys(SITE_SNOOZE_DURATION_MS) as SiteSnoozeDuration[];

export function readSiteHostname(pageUrl: string): string {
  try {
    return new URL(pageUrl).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return pageUrl.trim().toLowerCase();
  }
}

export async function snoozeSite(hostname: string, duration: SiteSnoozeDuration): Promise<void> {
  const normalizedHostname = hostname.trim().toLowerCase();

  if (!normalizedHostname) {
    return;
  }

  const stored = await readSiteSnoozes();
  stored[normalizedHostname] = Date.now() + SITE_SNOOZE_DURATION_MS[duration];
  await writeSiteSnoozes(stored);
}

export async function clearSiteSnooze(hostname: string): Promise<void> {
  const normalizedHostname = hostname.trim().toLowerCase();

  if (!normalizedHostname) {
    return;
  }

  const stored = await readSiteSnoozes();

  if (!(normalizedHostname in stored)) {
    return;
  }

  delete stored[normalizedHostname];
  await writeSiteSnoozes(stored);
}

export async function readSiteSnoozeExpiresAt(hostname: string): Promise<number | null> {
  const normalizedHostname = hostname.trim().toLowerCase();

  if (!normalizedHostname) {
    return null;
  }

  const stored = await readSiteSnoozes();
  const expiresAt = stored[normalizedHostname];

  if (!expiresAt) {
    return null;
  }

  if (Date.now() >= expiresAt) {
    delete stored[normalizedHostname];
    await writeSiteSnoozes(stored);
    return null;
  }

  return expiresAt;
}

export async function isSiteSnoozed(hostname: string): Promise<boolean> {
  return (await readSiteSnoozeExpiresAt(hostname)) !== null;
}

export function formatSiteSnoozeUntil(expiresAt: number): string {
  try {
    return new Intl.DateTimeFormat("ru", {
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      month: "short"
    }).format(new Date(expiresAt));
  } catch {
    return new Date(expiresAt).toLocaleString();
  }
}

async function readSiteSnoozes(): Promise<Record<string, number>> {
  try {
    const data = await chrome.storage.local.get(SITE_SNOOZE_STORAGE_KEY);
    const value = data[SITE_SNOOZE_STORAGE_KEY];

    if (!value || typeof value !== "object") {
      return {};
    }

    return value as Record<string, number>;
  } catch {
    return {};
  }
}

async function writeSiteSnoozes(stored: Record<string, number>): Promise<void> {
  try {
    await chrome.storage.local.set({
      [SITE_SNOOZE_STORAGE_KEY]: stored
    });
  } catch {
    // Ignore storage failures in content/background helpers.
  }
}
