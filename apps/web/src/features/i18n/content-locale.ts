import type { AppLocale } from "@reviewo/i18n";
import {
  appendContentLocaleParam,
  type ContentLocaleParam,
  resolveContentLocale,
  type LocalePreference
} from "@reviewo/shared";

export function resolveWebContentLocale(preference: LocalePreference): AppLocale {
  return resolveContentLocale(preference);
}

export function buildContentLocaleQuery(locale: ContentLocaleParam): string {
  const params = new URLSearchParams();
  appendContentLocaleParam(params, locale);

  return params.toString();
}

export function appendContentLocaleToPath(path: string, locale: ContentLocaleParam): string {
  const query = buildContentLocaleQuery(locale);

  if (!query) {
    return path;
  }

  return path.includes("?") ? `${path}&${query}` : `${path}?${query}`;
}

export type { ContentLocaleParam };
