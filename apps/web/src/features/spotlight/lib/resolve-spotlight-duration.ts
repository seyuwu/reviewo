import type { TranslateFn } from "@reviewo/i18n";

export function resolveSpotlightDurationHours(credits: number, hoursPerCredit: number): number {
  return credits * hoursPerCredit;
}

export function formatSpotlightDurationLabel(hours: number, t: TranslateFn): string {
  if (hours >= 24 && hours % 24 === 0) {
    return t("web.spotlight.durationDays", { count: String(hours / 24) });
  }

  return t("web.spotlight.durationHours", { count: String(hours) });
}
