import { isValidDotaMmrValue, type DotaGreenFlagKey, type DotaQualityKey, type DotaRedFlagKey } from "@reviewo/shared";

import type { TranslateFn } from "@reviewo/i18n";

const GREEN_FLAG_LABEL_KEYS: Record<DotaGreenFlagKey, string> = {
  adequate: "dota.flag.green.adequate",
  altushka: "dota.flag.green.altushka",
  good_caller: "dota.flag.green.goodCaller",
  has_mic: "dota.flag.green.hasMic",
  play_again: "dota.flag.green.playAgain",
  team_player: "dota.flag.green.teamPlayer"
};

const RED_FLAG_LABEL_KEYS: Record<DotaRedFlagKey, string> = {
  leaves: "dota.flag.red.leaves",
  ruins: "dota.flag.red.ruins",
  tilts: "dota.flag.red.tilts",
  toxic: "dota.flag.red.toxic"
};

export function getDotaQualityLabel(key: string, t: TranslateFn): string {
  return getDotaGreenFlagLabel(key as DotaQualityKey, t);
}

export function getDotaGreenFlagLabel(key: DotaGreenFlagKey, t: TranslateFn): string {
  const labelKey = GREEN_FLAG_LABEL_KEYS[key];
  return labelKey ? t(labelKey as never) : key;
}

export function getDotaRedFlagLabel(key: DotaRedFlagKey, t: TranslateFn): string {
  const labelKey = RED_FLAG_LABEL_KEYS[key];
  return labelKey ? t(labelKey as never) : key;
}

export function getDotaGenderLabel(gender: string | null | undefined, t: TranslateFn): string {
  switch (gender) {
    case "female":
      return t("dota.gender.female" as never);
    case "male":
      return t("dota.gender.male" as never);
    case "unspecified":
      return t("dota.gender.unspecified" as never);
    default:
      return "—";
  }
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

  if (mode === "single") {
    return isValidDotaMmrValue(normalizedFrom || normalizedTo);
  }

  return isValidDotaMmrValue(normalizedFrom) && isValidDotaMmrValue(normalizedTo);
}

export function resolveDotaMmrMode(from: string, to: string): "single" | "range" {
  const normalizedFrom = from.trim();
  const normalizedTo = to.trim();

  if (normalizedFrom && normalizedTo && normalizedFrom !== normalizedTo) {
    return "range";
  }

  return "single";
}
