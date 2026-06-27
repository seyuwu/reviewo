import {
  DEFAULT_EXTENSION_PREFERENCES,
  EXTENSION_PREFERENCES_STORAGE_KEY,
  type CardDisplayTarget,
  type ExtensionUserPreferences
} from "./preferences.js";

export async function readExtensionPreferences(): Promise<ExtensionUserPreferences> {
  let stored: Record<string, unknown>;

  try {
    stored = await chrome.storage.local.get(EXTENSION_PREFERENCES_STORAGE_KEY);
  } catch {
    return { ...DEFAULT_EXTENSION_PREFERENCES };
  }

  const candidate = stored[EXTENSION_PREFERENCES_STORAGE_KEY];

  if (!candidate || typeof candidate !== "object") {
    return { ...DEFAULT_EXTENSION_PREFERENCES };
  }

  const record = candidate as Partial<ExtensionUserPreferences>;
  const cardDisplayTarget = normalizeCardDisplayTarget(record.cardDisplayTarget);
  const autoDismissSeconds = normalizeAutoDismissSeconds(record.autoDismissSeconds);

  return {
    autoDismissSeconds,
    cardDisplayTarget
  };
}

export async function saveExtensionPreferences(
  preferences: ExtensionUserPreferences
): Promise<ExtensionUserPreferences> {
  const normalized = {
    autoDismissSeconds: normalizeAutoDismissSeconds(preferences.autoDismissSeconds),
    cardDisplayTarget: normalizeCardDisplayTarget(preferences.cardDisplayTarget)
  };

  try {
    await chrome.storage.local.set({
      [EXTENSION_PREFERENCES_STORAGE_KEY]: normalized
    });
  } catch {
    return normalized;
  }

  return normalized;
}

function normalizeCardDisplayTarget(value: unknown): CardDisplayTarget {
  if (value === "current" || value === "parent" || value === "both") {
    return value;
  }

  return DEFAULT_EXTENSION_PREFERENCES.cardDisplayTarget;
}

function normalizeAutoDismissSeconds(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_EXTENSION_PREFERENCES.autoDismissSeconds;
  }

  return Math.min(30, Math.max(0, Math.round(value)));
}
