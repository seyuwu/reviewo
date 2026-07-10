export function resolveBattleLocale(localeInput?: string): "ru" | "en" {
  if (localeInput === "en" || localeInput === "ru") {
    return localeInput;
  }

  return "ru";
}
