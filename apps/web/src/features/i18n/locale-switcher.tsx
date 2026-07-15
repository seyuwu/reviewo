"use client";

import { LOCALE_PREFERENCE_STORAGE_KEY, normalizeLocalePreference, type LocalePreference } from "@reviewo/i18n";

import { useLocale } from "./locale-provider";

const LOCALE_OPTIONS: Array<{ label: string; value: LocalePreference }> = [
  { label: "A", value: "auto" },
  { label: "EN", value: "en" },
  { label: "RU", value: "ru" }
];

export function LocaleSwitcher() {
  const { isLocaleHydrated, localePreference, setLocalePreference, t } = useLocale();

  return (
    <div className="locale-switcher" role="group" aria-label={t("locale.label")}>
      {LOCALE_OPTIONS.map((option) => {
        const isActive = isLocaleHydrated && localePreference === option.value;

        return (
          <button
            key={option.value}
            type="button"
            className={`locale-switcher-button${isActive ? " is-active" : ""}`}
            aria-pressed={isActive}
            title={localeOptionTitle(t, option.value)}
            onClick={() => {
              setLocalePreference(normalizeLocalePreference(option.value));
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function localeOptionTitle(
  t: ReturnType<typeof useLocale>["t"],
  value: LocalePreference
): string {
  if (value === "auto") {
    return t("locale.auto");
  }

  if (value === "ru") {
    return t("locale.ru");
  }

  return t("locale.en");
}

export function readStoredLocalePreference(): LocalePreference {
  if (typeof window === "undefined") {
    return "auto";
  }

  return normalizeLocalePreference(window.localStorage.getItem(LOCALE_PREFERENCE_STORAGE_KEY));
}
