"use client";

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";

import {
  createTranslator,
  LOCALE_PREFERENCE_STORAGE_KEY,
  normalizeLocalePreference,
  resolveLocale,
  type AppLocale,
  type LocalePreference,
  type TranslateFn
} from "@reviewo/i18n";

import { WEB_AUTH_BRIDGE_SOURCE } from "../auth/lib/web-auth-bridge";

interface LocaleContextValue {
  isLocaleHydrated: boolean;
  localePreference: LocalePreference;
  resolvedLocale: AppLocale;
  setLocalePreference: (preference: LocalePreference) => void;
  t: TranslateFn;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function readStoredLocalePreference(): LocalePreference {
  if (typeof window === "undefined") {
    return "auto";
  }

  return normalizeLocalePreference(window.localStorage.getItem(LOCALE_PREFERENCE_STORAGE_KEY));
}

interface LocaleProviderProps {
  children: ReactNode;
}

export function LocaleProvider({ children }: LocaleProviderProps) {
  const [localePreference, setLocalePreferenceState] = useState<LocalePreference>("auto");
  const [isLocaleHydrated, setIsLocaleHydrated] = useState(false);

  useEffect(() => {
    setLocalePreferenceState(readStoredLocalePreference());
    setIsLocaleHydrated(true);
  }, []);

  useEffect(() => {
    if (!isLocaleHydrated) {
      return;
    }

    document.documentElement.lang = resolveLocale(localePreference);

    const refreshFromStorage = (): void => {
      setLocalePreferenceState(readStoredLocalePreference());
    };

    const onStorage = (event: StorageEvent): void => {
      if (event.key === LOCALE_PREFERENCE_STORAGE_KEY) {
        refreshFromStorage();
      }
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("reviewo:locale-changed", refreshFromStorage);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("reviewo:locale-changed", refreshFromStorage);
    };
  }, [isLocaleHydrated, localePreference]);

  const setLocalePreference = (preference: LocalePreference): void => {
    window.localStorage.setItem(LOCALE_PREFERENCE_STORAGE_KEY, preference);
    setLocalePreferenceState(preference);
    document.documentElement.lang = resolveLocale(preference);
    window.dispatchEvent(new Event("reviewo:locale-changed"));
    window.postMessage(
      {
        preference,
        source: WEB_AUTH_BRIDGE_SOURCE,
        type: "reviewo:locale-changed"
      },
      window.location.origin
    );
  };

  const resolvedLocale = useMemo((): AppLocale => {
    if (!isLocaleHydrated) {
      return "en";
    }

    return resolveLocale(localePreference);
  }, [isLocaleHydrated, localePreference]);

  const t = useMemo(() => createTranslator(resolvedLocale), [resolvedLocale]);

  const value = useMemo(
    () => ({
      isLocaleHydrated,
      localePreference,
      resolvedLocale,
      setLocalePreference,
      t
    }),
    [isLocaleHydrated, localePreference, resolvedLocale, t]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);

  if (!context) {
    throw new Error("useLocale must be used within LocaleProvider.");
  }

  return context;
}

export function useTranslation(): TranslateFn {
  return useLocale().t;
}
