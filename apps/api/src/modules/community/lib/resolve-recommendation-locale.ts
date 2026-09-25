import { inferReviewLocaleFromText, parseExplicitLocale } from "@reviewo/shared";

export type RecommendationLocale = "ru" | "en";

export function resolveRecommendationLocale(input: {
  localeInput?: string | null | undefined;
  message?: string | null | undefined;
  reviewLocale?: string | null | undefined;
  topLocale?: string | null | undefined;
}): RecommendationLocale {
  const explicit =
    parseExplicitLocale(input.localeInput) ??
    parseExplicitLocale(input.reviewLocale) ??
    parseExplicitLocale(input.topLocale);

  if (explicit) {
    return explicit;
  }

  const trimmedMessage = input.message?.trim() ?? "";

  if (trimmedMessage) {
    return inferReviewLocaleFromText(trimmedMessage);
  }

  return "ru";
}

export function matchesRecommendationLocale(
  recommendationLocale: string,
  filterLocale: "ru" | "en" | "all"
): boolean {
  if (filterLocale === "all") {
    return true;
  }

  return recommendationLocale === filterLocale;
}
