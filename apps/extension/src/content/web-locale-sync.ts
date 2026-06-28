import {
  LOCALE_PREFERENCE_STORAGE_KEY,
  normalizeLocalePreference,
  type LocalePreference
} from "@reviewo/i18n";

import {
  addStorageChangedListener,
  guardExtensionContext,
  onExtensionContextInvalidated,
  removeStorageChangedListener
} from "./extension-context.js";
import { isReviewoWebPage } from "../shared/reviewo-web-page.js";
import { EXTENSION_PREFERENCES_STORAGE_KEY } from "../shared/preferences.js";
import { readExtensionPreferences, saveExtensionPreferences } from "../shared/extension-preferences-storage.js";

const WEB_AUTH_BRIDGE_SOURCE = "reviewo-web";

interface WebLocaleBridgeMessage {
  preference?: unknown;
  source?: unknown;
  type?: unknown;
}

let lastKnownWebLocale: string | null | undefined;

export function startWebLocaleSync(): void {
  if (!isReviewoWebPage()) {
    return;
  }

  void syncLocaleFromExtensionToWeb();

  const onStorageChanged = (event: StorageEvent): void => {
    if (event.key !== LOCALE_PREFERENCE_STORAGE_KEY) {
      return;
    }

    void pushWebLocaleToExtension(event.newValue);
  };

  const onWebLocaleBridgeMessage = (event: MessageEvent<WebLocaleBridgeMessage>): void => {
    if (event.source !== window || event.origin !== window.location.origin) {
      return;
    }

    if (event.data?.source !== WEB_AUTH_BRIDGE_SOURCE) {
      return;
    }

    if (event.data.type !== "reviewo:locale-changed") {
      return;
    }

    const preference = normalizeLocalePreference(event.data.preference);
    void applyLocalePreference(preference, "web");
  };

  window.addEventListener("storage", onStorageChanged);
  window.addEventListener("message", onWebLocaleBridgeMessage);

  const onExtensionLocaleChanged: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (
    changes,
    areaName
  ) => {
    if (!guardExtensionContext()) {
      return;
    }

    if (areaName !== "local") {
      return;
    }

    if (LOCALE_PREFERENCE_STORAGE_KEY in changes) {
      void syncLocaleFromExtensionToWeb();
      return;
    }

    if (EXTENSION_PREFERENCES_STORAGE_KEY in changes) {
      const nextPreferences = changes[EXTENSION_PREFERENCES_STORAGE_KEY]?.newValue as
        | { locale?: unknown }
        | undefined;
      const preference = normalizeLocalePreference(nextPreferences?.locale);

      mirrorLocaleToWebStorage(preference);
    }
  };

  addStorageChangedListener(onExtensionLocaleChanged);

  onExtensionContextInvalidated(() => {
    window.removeEventListener("storage", onStorageChanged);
    window.removeEventListener("message", onWebLocaleBridgeMessage);
    removeStorageChangedListener(onExtensionLocaleChanged);
  });
}

async function syncLocaleFromExtensionToWeb(): Promise<void> {
  if (!guardExtensionContext()) {
    return;
  }

  const preferences = await readExtensionPreferences();
  mirrorLocaleToWebStorage(preferences.locale);
}

async function pushWebLocaleToExtension(rawValue: string | null): Promise<void> {
  const preference = normalizeLocalePreference(rawValue);

  if (lastKnownWebLocale === preference) {
    return;
  }

  lastKnownWebLocale = preference;
  await applyLocalePreference(preference, "web");
}

async function applyLocalePreference(
  preference: LocalePreference,
  source: "web" | "extension"
): Promise<void> {
  if (!guardExtensionContext()) {
    return;
  }

  if (source === "web") {
    const preferences = await readExtensionPreferences();

    if (preferences.locale === preference) {
      mirrorLocaleToWebStorage(preference);
      return;
    }

    await saveExtensionPreferences({
      ...preferences,
      locale: preference
    });
  }

  mirrorLocaleToWebStorage(preference);
}

function mirrorLocaleToWebStorage(preference: LocalePreference): void {
  const serialized = preference;

  if (window.localStorage.getItem(LOCALE_PREFERENCE_STORAGE_KEY) === serialized) {
    lastKnownWebLocale = serialized;
    return;
  }

  window.localStorage.setItem(LOCALE_PREFERENCE_STORAGE_KEY, serialized);
  lastKnownWebLocale = serialized;
  document.documentElement.lang = resolveDocumentLang(preference);
  window.dispatchEvent(new Event("reviewo:locale-changed"));
}

function resolveDocumentLang(preference: LocalePreference): string {
  if (preference === "ru") {
    return "ru";
  }

  if (preference === "en") {
    return "en";
  }

  return navigator.language.toLowerCase().startsWith("ru") ? "ru" : "en";
}
