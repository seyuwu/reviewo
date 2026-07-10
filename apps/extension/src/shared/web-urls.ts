import { extensionConfig } from "./config.js";
import { appendPathContentLocale } from "./content-locale.js";
import type { ContentLocaleParam } from "@reviewo/shared";

function buildWebUrl(path: string): string {
  return new URL(path, extensionConfig.webBaseUrl).toString();
}

export function buildUserTopsUrl(locale?: ContentLocaleParam): string {
  const path = locale ? appendPathContentLocale("/tops", locale) : "/tops";

  return buildWebUrl(path);
}

export function buildBattlesUrl(locale?: ContentLocaleParam): string {
  const path = locale ? appendPathContentLocale("/battles", locale) : "/battles";

  return buildWebUrl(path);
}

export function buildEntityTopsUrl(entityId: string, locale?: ContentLocaleParam): string {
  const basePath = `/entities/${entityId}#entity-user-tops`;
  const path = locale ? appendPathContentLocale(basePath, locale) : basePath;

  return buildWebUrl(path);
}
