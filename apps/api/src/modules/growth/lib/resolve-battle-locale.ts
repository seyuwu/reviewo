import { parseExplicitLocale } from "@reviewo/shared";

export function resolveBattleLocale(localeInput?: string): "ru" | "en" {
  return parseExplicitLocale(localeInput) ?? "ru";
}
