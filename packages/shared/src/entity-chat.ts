export const ENTITY_CHAT_LOCALES = ["ru", "en"] as const;

export type EntityChatLocale = (typeof ENTITY_CHAT_LOCALES)[number];

export const DEFAULT_ENTITY_CHAT_LOCALE: EntityChatLocale = "ru";

export function normalizeEntityChatLocale(value?: string | null): EntityChatLocale {
  return value === "en" ? "en" : "ru";
}

export function isEntityChatLocale(value: string): value is EntityChatLocale {
  return value === "ru" || value === "en";
}

/** Socket.io room id; default locale keeps the legacy room name. */
export function buildEntityChatSocketRoomName(
  entityId: string,
  locale: EntityChatLocale = DEFAULT_ENTITY_CHAT_LOCALE
): string {
  if (locale === DEFAULT_ENTITY_CHAT_LOCALE) {
    return `entity:${entityId}`;
  }

  return `entity:${entityId}:${locale}`;
}

/** Redis presence key scoped by entity and locale. */
export function buildEntityChatPresenceKey(
  entityId: string,
  locale: EntityChatLocale = DEFAULT_ENTITY_CHAT_LOCALE
): string {
  if (locale === DEFAULT_ENTITY_CHAT_LOCALE) {
    return `chat:entity:${entityId}:online`;
  }

  return `chat:entity:${entityId}:${locale}:online`;
}

export function buildEntityChatConnectionKey(
  entityId: string,
  locale: EntityChatLocale = DEFAULT_ENTITY_CHAT_LOCALE
): string {
  return `${entityId}:${locale}`;
}
