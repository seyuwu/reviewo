export const DOTA_VERTICAL = "dota" as const;

export const DOTA_ATTRIBUTE_KEYS = {
  vertical: "vertical",
  dotaAccountId: "dota_account_id",
  mmr: "mmr",
  roles: "roles",
  server: "server",
  language: "language",
  gender: "gender",
  hasMic: "has_mic",
  playIntent: "play_intent",
  /** How the player wants stack matching: auto (we pick) vs manual (browse feed). */
  matchMode: "match_mode",
  lfgUntil: "lfg_until",
  lfgPartySlug: "lfg_party_slug",
  lfgDesiredSize: "lfg_desired_size",
  lfgRecruitedRoles: "lfg_recruited_roles",
  lfgPartyName: "lfg_party_name",
  lfgPartyKind: "lfg_party_kind",
  lfgMemberCount: "lfg_member_count",
  lfgMaxMembers: "lfg_max_members"
} as const;

/** How long "Looking for party" stays active without refresh. */
export const DOTA_LFG_TTL_SECONDS = 20 * 60;

export const DOTA_GENDER_VALUES = ["female", "male", "unspecified"] as const;
export type DotaGender = (typeof DOTA_GENDER_VALUES)[number];

export const DOTA_MATCH_MODE_VALUES = ["auto", "manual"] as const;
export type DotaMatchMode = (typeof DOTA_MATCH_MODE_VALUES)[number];

export function isDotaMatchMode(value: string): value is DotaMatchMode {
  return (DOTA_MATCH_MODE_VALUES as readonly string[]).includes(value);
}

/** Compact vibe tags — keep short so people actually click. */
export const DOTA_GREEN_FLAG_KEYS = [
  "play_again",
  "has_mic",
  "adequate",
  "team_player",
  "good_caller",
  "altushka"
] as const;

export const DOTA_RED_FLAG_KEYS = ["toxic", "tilts", "leaves", "ruins"] as const;

/** @deprecated Use green flags; kept as alias for older confirmation keys. */
export const DOTA_QUALITY_KEYS = DOTA_GREEN_FLAG_KEYS;

export type DotaGreenFlagKey = (typeof DOTA_GREEN_FLAG_KEYS)[number];
export type DotaRedFlagKey = (typeof DOTA_RED_FLAG_KEYS)[number];
export type DotaQualityKey = DotaGreenFlagKey;
export type DotaConfirmationKey = DotaGreenFlagKey | DotaRedFlagKey;

/** Max selectable flags per polarity (choose up to this many from the list). */
export const DOTA_FLAG_LIMIT_PER_SIDE = 5;
export const DOTA_CONFIRMATION_MILESTONE = 3;
export const DOTA_ACCOUNT_ID_PATTERN = /^\d{8,10}$/;
export const DOTA_MMR_MAX = 18000;
const DOTA_MMR_VALUE_PATTERN = /^\d{1,5}$/;

export function isValidDotaMmrValue(value: string): boolean {
  const normalized = value.trim();

  if (!DOTA_MMR_VALUE_PATTERN.test(normalized)) {
    return false;
  }

  const numeric = Number(normalized);

  return Number.isInteger(numeric) && numeric >= 0 && numeric <= DOTA_MMR_MAX;
}

export function isValidDotaMmr(value: string): boolean {
  const normalized = value.trim();

  if (!normalized) {
    return false;
  }

  if (normalized.includes("-")) {
    const parts = normalized.split("-");

    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return false;
    }

    return isValidDotaMmrValue(parts[0]) && isValidDotaMmrValue(parts[1]);
  }

  return isValidDotaMmrValue(normalized);
}

export function isDotaGender(value: string): value is DotaGender {
  return (DOTA_GENDER_VALUES as readonly string[]).includes(value);
}

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
  return isDotaGreenFlagKey(value) || isDotaRedFlagKey(value);
}

export function isValidDotaAccountId(value: string): boolean {
  return DOTA_ACCOUNT_ID_PATTERN.test(value.trim());
}
