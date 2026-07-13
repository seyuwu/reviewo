export const DOTA_VERTICAL = "dota" as const;

export const DOTA_ATTRIBUTE_KEYS = {
  vertical: "vertical",
  dotaAccountId: "dota_account_id",
  mmr: "mmr",
  roles: "roles",
  server: "server",
  language: "language",
  hasMic: "has_mic",
  playIntent: "play_intent"
} as const;

export const DOTA_QUALITY_KEYS = [
  "has_mic",
  "chill",
  "good_caller",
  "stress_resistant",
  "good_support"
] as const;

export const DOTA_GREEN_FLAG_KEYS = [
  "has_mic",
  "chill",
  "good_caller",
  "stress_resistant",
  "good_support",
  "team_player",
  "positive",
  "punctual",
  "flexible_roles",
  "good_comms",
  "clutch",
  "fair_play",
  "listens",
  "no_tilt",
  "stack_friendly",
  "game_sense",
  "reliable",
  "fun",
  "shotcalling",
  "trustworthy"
] as const;

export const DOTA_RED_FLAG_KEYS = [
  "toxic",
  "no_mic",
  "tilts",
  "afk",
  "throws",
  "griefing",
  "spam_pings",
  "blame",
  "selfish",
  "refuses_role",
  "negative",
  "ragequit",
  "smurf_sus",
  "boosted",
  "mute_refusal",
  "feeds",
  "bad_calls",
  "pause_abuse",
  "account_share",
  "scammer"
] as const;

export type DotaQualityKey = (typeof DOTA_QUALITY_KEYS)[number];
export type DotaGreenFlagKey = (typeof DOTA_GREEN_FLAG_KEYS)[number];
export type DotaRedFlagKey = (typeof DOTA_RED_FLAG_KEYS)[number];
export type DotaConfirmationKey = DotaQualityKey | DotaGreenFlagKey | DotaRedFlagKey;

export const DOTA_FLAG_LIMIT_PER_SIDE = 5;
export const DOTA_CONFIRMATION_MILESTONE = 3;
export const DOTA_ACCOUNT_ID_PATTERN = /^\d{8,10}$/;

export function isDotaQualityKey(value: string): value is DotaQualityKey {
  return (DOTA_QUALITY_KEYS as readonly string[]).includes(value);
}

export function isDotaGreenFlagKey(value: string): value is DotaGreenFlagKey {
  return (DOTA_GREEN_FLAG_KEYS as readonly string[]).includes(value);
}

export function isDotaRedFlagKey(value: string): value is DotaRedFlagKey {
  return (DOTA_RED_FLAG_KEYS as readonly string[]).includes(value);
}

export function isDotaConfirmationKey(value: string): value is DotaConfirmationKey {
  return (
    isDotaQualityKey(value) || isDotaGreenFlagKey(value) || isDotaRedFlagKey(value)
  );
}

export function isValidDotaAccountId(value: string): boolean {
  return DOTA_ACCOUNT_ID_PATTERN.test(value.trim());
}
