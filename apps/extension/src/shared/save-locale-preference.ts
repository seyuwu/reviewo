import type { LocalePreference } from "@reviewo/i18n";

import {
  readExtensionPreferences,
  saveExtensionPreferences
} from "./extension-preferences-storage.js";

export async function saveLocalePreference(locale: LocalePreference): Promise<LocalePreference> {
  const preferences = await readExtensionPreferences();

  if (preferences.locale === locale) {
    return preferences.locale;
  }

  const saved = await saveExtensionPreferences({
    ...preferences,
    locale
  });

  return saved.locale;
}

export async function readLocalePreference(): Promise<LocalePreference> {
  const preferences = await readExtensionPreferences();
  return preferences.locale;
}
