import { readExtensionPreferences } from "../../shared/extension-preferences-storage.js";
import {
  DEFAULT_EXTENSION_PREFERENCES,
  EXTENSION_PREFERENCES_STORAGE_KEY,
  type ExtensionUserPreferences
} from "../../shared/preferences.js";
import {
  isTypingTarget,
  matchesRatingCardHotkey
} from "../../shared/rating-card-hotkey.js";
import { addStorageChangedListener, removeStorageChangedListener } from "../extension-context.js";

export function installRatingCardHotkeyTrigger(onTrigger: () => void): () => void {
  let cachedPreferences: ExtensionUserPreferences = { ...DEFAULT_EXTENSION_PREFERENCES };

  void readExtensionPreferences().then((preferences) => {
    cachedPreferences = preferences;
  });

  const onPreferencesChanged: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (
    changes,
    areaName
  ) => {
    if (areaName !== "local" || !(EXTENSION_PREFERENCES_STORAGE_KEY in changes)) {
      return;
    }

    const nextValue = changes[EXTENSION_PREFERENCES_STORAGE_KEY]?.newValue;

    if (!nextValue || typeof nextValue !== "object") {
      cachedPreferences = { ...DEFAULT_EXTENSION_PREFERENCES };
      return;
    }

    void readExtensionPreferences().then((preferences) => {
      cachedPreferences = preferences;
    });
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!cachedPreferences.ratingCardHotkeyEnabled) {
      return;
    }

    if (event.repeat || isTypingTarget(event.target)) {
      return;
    }

    if (!matchesRatingCardHotkey(event, cachedPreferences.ratingCardHotkey)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onTrigger();
  };

  addStorageChangedListener(onPreferencesChanged);
  window.addEventListener("keydown", onKeyDown, true);

  return () => {
    removeStorageChangedListener(onPreferencesChanged);
    window.removeEventListener("keydown", onKeyDown, true);
  };
}
