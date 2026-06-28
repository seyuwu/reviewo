export type LocalePreference = "auto" | "en" | "ru";

export type AppLocale = "en" | "ru";

export const LOCALE_PREFERENCE_STORAGE_KEY = "reviewo.localePreference";

export const DEFAULT_LOCALE_PREFERENCE: LocalePreference = "auto";

export function resolveLocale(
  preference: LocalePreference,
  browserLanguages: readonly string[] = typeof navigator !== "undefined"
    ? navigator.languages
    : []
): AppLocale {
  if (preference === "en" || preference === "ru") {
    return preference;
  }

  for (const language of browserLanguages) {
    const normalized = language.trim().toLowerCase();

    if (normalized.startsWith("ru")) {
      return "ru";
    }

    if (normalized.startsWith("en")) {
      return "en";
    }
  }

  return "en";
}

export function normalizeLocalePreference(value: unknown): LocalePreference {
  if (value === "auto" || value === "en" || value === "ru") {
    return value;
  }

  return DEFAULT_LOCALE_PREFERENCE;
}
