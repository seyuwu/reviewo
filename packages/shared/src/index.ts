export type ReliabilityLevel = "very_high" | "high" | "medium" | "low";

export {
  buildEntityChatConnectionKey,
  buildEntityChatPresenceKey,
  buildEntityChatSocketRoomName,
  DEFAULT_ENTITY_CHAT_LOCALE,
  ENTITY_CHAT_LOCALES,
  isEntityChatLocale,
  normalizeEntityChatLocale,
  type EntityChatLocale
} from "./entity-chat.js";

export {
  buildCompareSlug,
  buildPairKey,
  parseCompareSlug,
  type ParsedCompareSlug
} from "./compare-slug.js";

export {
  appendEntityChatMessageNewest,
  ENTITY_CHAT_CARD_CACHE_MAX_ENTRIES,
  ENTITY_CHAT_CLIENT_INITIAL_LIMIT,
  ENTITY_CHAT_CLIENT_MAX_MESSAGES,
  ENTITY_CHAT_CLIENT_OLDER_LIMIT,
  mergeEntityChatMessagesNewest,
  prependEntityChatMessagesOldest,
  resolveEntityChatOlderCursor,
  trimEntityChatMessagesNewest,
  trimEntityChatMessagesOldest,
  type EntityChatMessageLike
} from "./entity-chat-messages.js";

export function resolveReliabilityLevel(score: number): ReliabilityLevel {
  if (score >= 0.95) {
    return "very_high";
  }

  if (score >= 0.8) {
    return "high";
  }

  if (score >= 0.6) {
    return "medium";
  }

  return "low";
}

export function resolveManipulationRiskLevel(risk: number): ReliabilityLevel {
  if (risk >= 0.75) {
    return "low";
  }

  if (risk >= 0.5) {
    return "medium";
  }

  if (risk >= 0.25) {
    return "high";
  }

  return "very_high";
}
