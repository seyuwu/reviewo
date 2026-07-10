import { inferReviewLocaleFromText } from "@reviewo/shared";

export type RecommendationLocale = "ru" | "en";

export function resolveRecommendationLocale(input: {
  localeInput?: string | null | undefined;
  message?: string | null | undefined;
  reviewLocale?: string | null | undefined;
  topLocale?: string | null | undefined;
}): RecommendationLocale {
  if (input.localeInput === "en" || input.localeInput === "ru") {
    return input.localeInput;
  }

  if (input.reviewLocale === "en" || input.reviewLocale === "ru") {
    return input.reviewLocale;
  }

  if (input.topLocale === "en" || input.topLocale === "ru") {
    return input.topLocale;
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
