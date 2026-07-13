import type { TranslateFn } from "@reviewo/i18n";

import { publicEnv } from "../../../lib/config/public-env";
import { copyTextToClipboard } from "../../growth/lib/share-urls";
import type { DotaProfile, DotaShareKind } from "../types/dota";

export function buildDotaProfileUrl(slug: string): string {
  return new URL(`/dota/${slug}`, publicEnv.siteUrl).toString();
}

export function buildDotaConfirmUrl(slug: string, ref?: string): string {
  const url = new URL(`/dota/${slug}/confirm`, publicEnv.siteUrl);

  if (ref) {
    url.searchParams.set("ref", ref);
  }

  return url.toString();
}

export function buildDotaIdUrl(accountId: string): string {
  return new URL(`/dota/id/${accountId}`, publicEnv.siteUrl).toString();
}

export function buildDotaOgImageUrl(slug: string): string {
  return new URL(`/og/dota/${slug}`, publicEnv.siteUrl).toString();
}

export function buildDotaShareText(
  kind: DotaShareKind,
  profile: Pick<DotaProfile, "dotaAccountId" | "slug">,
  t: TranslateFn
): string {
  if (kind === "confirm") {
    return t("dota.share.confirmText" as never, {
      url: buildDotaConfirmUrl(profile.slug, profile.slug)
    });
  }

  if (kind === "id") {
    return t("dota.share.idText" as never, {
      accountId: profile.dotaAccountId,
      url: buildDotaIdUrl(profile.dotaAccountId)
    });
  }

  return t("dota.share.profileText" as never, {
    url: buildDotaProfileUrl(profile.slug)
  });
}

export async function copyDotaShareText(
  kind: DotaShareKind,
  profile: Pick<DotaProfile, "dotaAccountId" | "slug">,
  t: TranslateFn
): Promise<boolean> {
  return copyTextToClipboard(buildDotaShareText(kind, profile, t));
}
