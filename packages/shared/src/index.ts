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
  appendContentLocaleParam,
  inferReviewLocaleFromText,
  normalizeContentLocaleFilter,
  parseContentLocaleParam,
  resolveContentLocale,
  type ContentLocaleParam,
  type LocalePreference
} from "./content-locale.js";

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

export {
  DOTA_ACCOUNT_ID_PATTERN,
  DOTA_ATTRIBUTE_KEYS,
  DOTA_CONFIRMATION_MILESTONE,
  DOTA_GENDER_VALUES,
  DOTA_LFG_TTL_SECONDS,
  DOTA_FLAG_LIMIT_PER_SIDE,
  DOTA_GREEN_FLAG_KEYS,
  DOTA_MATCH_MODE_VALUES,
  DOTA_QUALITY_KEYS,
  DOTA_RED_FLAG_KEYS,
  DOTA_VERTICAL,
  isDotaConfirmationKey,
  isDotaGender,
  isDotaGreenFlagKey,
  isDotaMatchMode,
  isDotaQualityKey,
  isDotaRedFlagKey,
  isValidDotaAccountId,
  type DotaConfirmationKey,
  type DotaGender,
  type DotaGreenFlagKey,
  type DotaMatchMode,
  type DotaQualityKey,
  type DotaRedFlagKey
} from "./dota-vertical.js";

export {
  DOTA_PARTY_SIZE,
  DOTA_PARTY_VERTICAL,
  DOTA_PARTY_INVITE_TTL_HOURS,
  DOTA_POSITION_ROLES,
  DOTA_TEAM_DISCORD_VOICE_EXTEND_HOURS,
  DOTA_TEAM_DISCORD_VOICE_MAX_LIFETIME_HOURS,
  DOTA_TEAM_DISCORD_VOICE_TTL_HOURS,
  DOTA_TEMP_PARTY_EXTEND_HOURS,
  DOTA_TEMP_PARTY_MAX_LIFETIME_HOURS,
  DOTA_TEMP_PARTY_TTL_HOURS,
  generateDotaPartyName,
  isDotaPositionRole,
  isGamePartyJoinMode,
  type DotaFriendshipStatus,
  type DotaPositionRole,
  type FriendshipStatusValue,
  type GamePartyJoinMode,
  type GamePartyKind,
  type GamePartyMemberRole,
  type GamePartyVisibility,
  type PartyInviteStatusValue
} from "./game-party.js";

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

export {
  ANALYTICS_COUNTER_KEYS,
  ANALYTICS_CTA_KEYS,
  ANALYTICS_PATH_KEYS,
  WAITLIST_INVITE_QUERY,
  WAITLIST_INVITE_VALUE,
  bucketAnalyticsPath,
  dotaHostVisitorScopeKey,
  funnelStepForPath,
  isAnalyticsCounterKey,
  isAnalyticsCtaKey,
  isAnalyticsPathKey,
  isDotaHostVisitorScopeKey,
  type AnalyticsCounterKey,
  type AnalyticsCtaKey,
  type AnalyticsPathKey
} from "./product-analytics.js";
