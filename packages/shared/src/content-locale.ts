import { normalizeEntityChatLocale, type EntityChatLocale } from "./entity-chat.js";

export type ContentLocaleParam = EntityChatLocale | "all";

export type LocalePreference = "auto" | "en" | "ru";

export function parseContentLocaleParam(value?: string | null): ContentLocaleParam | undefined {
  if (value === "all") {
    return "all";
  }

  if (value === "en" || value === "ru") {
    return value;
  }

  return undefined;
}

export function appendContentLocaleParam(
  params: URLSearchParams,
  locale: ContentLocaleParam
): void {
  params.set("locale", locale);
}

export function resolveContentLocale(
  preference: LocalePreference,
  browserLanguages: readonly string[] = typeof navigator !== "undefined"
    ? navigator.languages
    : []
): EntityChatLocale {
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

export function inferReviewLocaleFromText(text: string): EntityChatLocale {
  return /[\u0400-\u04FF]/.test(text) ? "ru" : "en";
}

export function normalizeContentLocaleFilter(
  value?: string | null,
  fallback: ContentLocaleParam = "all"
): ContentLocaleParam {
  return parseContentLocaleParam(value) ?? fallback;
}
