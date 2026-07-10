import type { TranslateFn } from "@reviewo/i18n";

export function formatSpotlightEndsIn(endsAt: string, t: TranslateFn): string {
  const remainingMs = new Date(endsAt).getTime() - Date.now();

  if (remainingMs <= 0) {
    return t("web.spotlight.endsSoon");
  }

  const hours = Math.ceil(remainingMs / 3_600_000);

  if (hours >= 48) {
    const days = Math.ceil(hours / 24);

    return t("web.spotlight.endsInDays", { count: String(days) });
  }

  if (hours >= 2) {
    return t("web.spotlight.endsInHours", { count: String(hours) });
  }

  return t("web.spotlight.endsSoon");
}
