import type { DotaGreenFlagKey, DotaQualityKey, DotaRedFlagKey } from "@reviewo/shared";

import type { TranslateFn } from "@reviewo/i18n";

const QUALITY_LABEL_KEYS: Record<DotaQualityKey, string> = {
  chill: "dota.quality.chill",
  good_caller: "dota.quality.goodCaller",
  good_support: "dota.quality.goodSupport",
  has_mic: "dota.quality.hasMic",
  stress_resistant: "dota.quality.stressResistant"
};

const GREEN_FLAG_LABEL_KEYS: Record<DotaGreenFlagKey, string> = {
  chill: "dota.flag.green.chill",
  clutch: "dota.flag.green.clutch",
  fair_play: "dota.flag.green.fairPlay",
  flexible_roles: "dota.flag.green.flexibleRoles",
  fun: "dota.flag.green.fun",
  game_sense: "dota.flag.green.gameSense",
  good_caller: "dota.flag.green.goodCaller",
  good_comms: "dota.flag.green.goodComms",
  good_support: "dota.flag.green.goodSupport",
  has_mic: "dota.flag.green.hasMic",
  listens: "dota.flag.green.listens",
  no_tilt: "dota.flag.green.noTilt",
  positive: "dota.flag.green.positive",
  punctual: "dota.flag.green.punctual",
  reliable: "dota.flag.green.reliable",
  shotcalling: "dota.flag.green.shotcalling",
  stack_friendly: "dota.flag.green.stackFriendly",
  stress_resistant: "dota.flag.green.stressResistant",
  team_player: "dota.flag.green.teamPlayer",
  trustworthy: "dota.flag.green.trustworthy"
};

const RED_FLAG_LABEL_KEYS: Record<DotaRedFlagKey, string> = {
  account_share: "dota.flag.red.accountShare",
  afk: "dota.flag.red.afk",
  bad_calls: "dota.flag.red.badCalls",
  blame: "dota.flag.red.blame",
  boosted: "dota.flag.red.boosted",
  feeds: "dota.flag.red.feeds",
  griefing: "dota.flag.red.griefing",
  mute_refusal: "dota.flag.red.muteRefusal",
  negative: "dota.flag.red.negative",
  no_mic: "dota.flag.red.noMic",
  pause_abuse: "dota.flag.red.pauseAbuse",
  ragequit: "dota.flag.red.ragequit",
  refuses_role: "dota.flag.red.refusesRole",
  scammer: "dota.flag.red.scammer",
  selfish: "dota.flag.red.selfish",
  smurf_sus: "dota.flag.red.smurfSus",
  spam_pings: "dota.flag.red.spamPings",
  throws: "dota.flag.red.throws",
  tilts: "dota.flag.red.tilts",
  toxic: "dota.flag.red.toxic"
};

export function getDotaQualityLabel(key: string, t: TranslateFn): string {
  const labelKey = QUALITY_LABEL_KEYS[key as DotaQualityKey];

  return labelKey ? t(labelKey as never) : key;
}

export function getDotaGreenFlagLabel(key: DotaGreenFlagKey, t: TranslateFn): string {
  return t(GREEN_FLAG_LABEL_KEYS[key] as never);
}

export function getDotaRedFlagLabel(key: DotaRedFlagKey, t: TranslateFn): string {
  return t(RED_FLAG_LABEL_KEYS[key] as never);
}

export function formatDotaRoles(roles: string[]): string {
  return roles.length > 0 ? roles.join(" / ") : "—";
}

export function getDotaPositionLabel(role: string, t: TranslateFn): string {
  switch (role) {
    case "1":
      return t("dota.position.1" as never);
    case "2":
      return t("dota.position.2" as never);
    case "3":
      return t("dota.position.3" as never);
    case "4":
      return t("dota.position.4" as never);
    case "5":
      return t("dota.position.5" as never);
    default:
      return role;
  }
}

export function formatDotaMmr(mmr: string | null): string {
  if (!mmr) {
    return "—";
  }

  if (mmr.includes("-")) {
    const [from = "", to = ""] = mmr.split("-");

    return `${from.trim()} – ${to.trim()}`;
  }

  return mmr;
}

export function parseDotaMmrRange(mmr: string | null): { from: string; to: string } {
  if (!mmr) {
    return { from: "", to: "" };
  }

  if (mmr.includes("-")) {
    const [from = "", to = ""] = mmr.split("-");

    return { from: from.trim(), to: to.trim() };
  }

  return { from: mmr.trim(), to: mmr.trim() };
}

export function formatDotaMmrRange(from: string, to: string): string | null {
  const normalizedFrom = from.trim();
  const normalizedTo = to.trim();

  if (!normalizedFrom && !normalizedTo) {
    return null;
  }

  if (normalizedFrom && normalizedTo) {
    if (normalizedFrom === normalizedTo) {
      return normalizedFrom;
    }

    return `${normalizedFrom}-${normalizedTo}`;
  }

  return normalizedFrom || normalizedTo;
}

export function isValidDotaMmrInput(from: string, to: string, mode: "single" | "range"): boolean {
  const normalizedFrom = from.trim();
  const normalizedTo = to.trim();
  const mmrPattern = /^\d{1,5}$/;

  if (mode === "single") {
    return mmrPattern.test(normalizedFrom || normalizedTo);
  }

  return mmrPattern.test(normalizedFrom) && mmrPattern.test(normalizedTo);
}

export function resolveDotaMmrMode(from: string, to: string): "single" | "range" {
  const normalizedFrom = from.trim();
  const normalizedTo = to.trim();

  if (normalizedFrom && normalizedTo && normalizedFrom !== normalizedTo) {
    return "range";
  }

  return "single";
}
