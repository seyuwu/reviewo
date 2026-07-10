import type { ContentLocaleParam, LocalePreference } from "@reviewo/shared";
import { appendContentLocaleParam, resolveContentLocale } from "@reviewo/shared";

export function resolveExtensionContentLocale(preference: LocalePreference): "en" | "ru" {
  return resolveContentLocale(preference);
}

export function appendPathContentLocale(path: string, locale: ContentLocaleParam): string {
  const params = new URLSearchParams();

  if (path.includes("?")) {
    const [basePath, query = ""] = path.split("?", 2);
    const existing = new URLSearchParams(query);
    existing.forEach((value, key) => {
      params.set(key, value);
    });
    appendContentLocaleParam(params, locale);

    return `${basePath}?${params.toString()}`;
  }

  appendContentLocaleParam(params, locale);

  return `${path}?${params.toString()}`;
}

export function resolveReviewsContentLocale(
  preference: LocalePreference,
  showAllReviews: boolean
): ContentLocaleParam {
  return showAllReviews ? "all" : resolveExtensionContentLocale(preference);
}
