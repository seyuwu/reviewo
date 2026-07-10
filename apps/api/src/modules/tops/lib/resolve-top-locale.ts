import { inferReviewLocaleFromText } from "@reviewo/shared";

export function resolveTopLocale(
  localeInput: string | undefined,
  title: string,
  description?: string | null
): "ru" | "en" {
  if (localeInput === "en" || localeInput === "ru") {
    return localeInput;
  }

  const combined = `${title} ${description ?? ""}`.trim();

  return inferReviewLocaleFromText(combined || "en");
}
