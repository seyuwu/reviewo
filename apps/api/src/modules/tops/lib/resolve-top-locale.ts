import { inferReviewLocaleFromText, parseExplicitLocale } from "@reviewo/shared";

export function resolveTopLocale(
  localeInput: string | undefined,
  title: string,
  description?: string | null
): "ru" | "en" {
  const explicit = parseExplicitLocale(localeInput);

  if (explicit) {
    return explicit;
  }

  const combined = `${title} ${description ?? ""}`.trim();

  return inferReviewLocaleFromText(combined || "en");
}
