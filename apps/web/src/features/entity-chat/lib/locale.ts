export type { EntityChatLocale } from "@reviewo/shared";
export {
  buildEntityChatConnectionKey,
  DEFAULT_ENTITY_CHAT_LOCALE,
  ENTITY_CHAT_LOCALES
} from "@reviewo/shared";

import type { EntityChatLocale } from "@reviewo/shared";

export function appendEntityChatLocaleParam(
  params: URLSearchParams,
  locale: EntityChatLocale
): void {
  if (locale !== "ru") {
    params.set("locale", locale);
  }
}

export function buildEntityChatLocaleQuery(locale: EntityChatLocale): string {
  return locale === "ru" ? "" : `?locale=${locale}`;
}
