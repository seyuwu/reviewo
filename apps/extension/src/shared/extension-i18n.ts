import {
  createTranslator,
  resolveLocale,
  type LocalePreference,
  type TranslateFn
} from "@reviewo/i18n";

import { readExtensionPreferences } from "./extension-preferences-storage.js";

export async function createExtensionTranslator(): Promise<TranslateFn> {
  const preferences = await readExtensionPreferences();
  return createExtensionTranslatorFromPreference(preferences.locale);
}

export function createExtensionTranslatorFromPreference(
  preference: LocalePreference
): TranslateFn {
  return createTranslator(resolveLocale(preference));
}
