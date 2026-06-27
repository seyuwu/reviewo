import {
  DEFAULT_EXTENSION_PREFERENCES,
  EXTENSION_PREFERENCES_STORAGE_KEY,
  type CardPlacement,
  type ExtensionUserPreferences,
  type PopupReviewDisplayMode
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
  const autoDismissSeconds = normalizeAutoDismissSeconds(record.autoDismissSeconds);
  const cardPlacement = normalizeCardPlacement(record.cardPlacement);
  const popupReviewDisplayMode = normalizePopupReviewDisplayMode(record.popupReviewDisplayMode);
  const popupReviewsLimit = normalizePopupReviewsLimit(record.popupReviewsLimit);

  return {
    autoDismissSeconds,
    cardPlacement,
    popupReviewDisplayMode,
    popupReviewsLimit
  };
}

export async function saveExtensionPreferences(
  preferences: ExtensionUserPreferences
): Promise<ExtensionUserPreferences> {
  const normalized = {
    autoDismissSeconds: normalizeAutoDismissSeconds(preferences.autoDismissSeconds),
    cardPlacement: normalizeCardPlacement(preferences.cardPlacement),
    popupReviewDisplayMode: normalizePopupReviewDisplayMode(preferences.popupReviewDisplayMode),
    popupReviewsLimit: normalizePopupReviewsLimit(preferences.popupReviewsLimit)
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

function normalizeCardPlacement(value: unknown): CardPlacement {
  if (
    value === "bottom-left" ||
    value === "bottom-right" ||
    value === "top-left" ||
    value === "top-right"
  ) {
    return value;
  }

  return DEFAULT_EXTENSION_PREFERENCES.cardPlacement;
}

function normalizeAutoDismissSeconds(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_EXTENSION_PREFERENCES.autoDismissSeconds;
  }

  return Math.min(30, Math.max(0, Math.round(value)));
}

function normalizePopupReviewDisplayMode(value: unknown): PopupReviewDisplayMode {
  if (value === "compact" || value === "full") {
    return value;
  }

  return DEFAULT_EXTENSION_PREFERENCES.popupReviewDisplayMode;
}

function normalizePopupReviewsLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_EXTENSION_PREFERENCES.popupReviewsLimit;
  }

  return Math.min(50, Math.max(1, Math.round(value)));
}
