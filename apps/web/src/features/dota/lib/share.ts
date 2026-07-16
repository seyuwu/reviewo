import type { TranslateFn } from "@reviewo/i18n";

import { getDotaPublicOrigin } from "../../../lib/config/product-hosts";
import { copyTextToClipboard } from "../../growth/lib/share-urls";
import type { DotaProfile, DotaShareKind } from "../types/dota";

function dotaAbsoluteUrl(pathname: string): URL {
  return new URL(pathname, `${getDotaPublicOrigin()}/`);
}

export function buildDotaProfileUrl(slug: string): string {
  return dotaAbsoluteUrl(`/dota/${slug}`).toString();
}

/** Owner-shared link: opening while signed in auto-adds friendship (requires signed token). */
export function buildDotaFriendInviteUrl(slug: string, inviteToken: string): string {
  const url = dotaAbsoluteUrl(`/dota/${slug}`);
  url.searchParams.set("friendInvite", inviteToken);
  return url.toString();
}

export function buildDotaConfirmUrl(slug: string, ref?: string): string {
  const url = dotaAbsoluteUrl(`/dota/${slug}/confirm`);

  if (ref) {
    url.searchParams.set("ref", ref);
  }

  return url.toString();
}

export function buildDotaIdUrl(accountId: string): string {
  return dotaAbsoluteUrl(`/dota/id/${accountId}`).toString();
}

export function buildDotaOgImageUrl(slug: string): string {
  return dotaAbsoluteUrl(`/og/dota/${slug}`).toString();
}

export function buildDotaTeamUrl(slug: string): string {
  return dotaAbsoluteUrl(`/dota/teams/${slug}`).toString();
}

/** Signed join link: opening while signed in auto-adds the viewer to the party. */
export function buildDotaTeamJoinUrl(slug: string, joinToken: string): string {
  const url = dotaAbsoluteUrl(`/dota/teams/${slug}`);
  url.searchParams.set("join", joinToken);
  return url.toString();
}

export function buildDotaShareText(
  kind: DotaShareKind,
  profile: Pick<DotaProfile, "dotaAccountId" | "slug">,
  t: TranslateFn,
  friendInviteToken?: string
): string {
  if (kind === "confirm") {
    return t("dota.share.confirmText" as never, {
      url: buildDotaConfirmUrl(profile.slug, profile.slug)
    });
  }

  if (kind === "friend") {
    if (!friendInviteToken) {
      throw new Error("friendInviteToken is required for friend share text");
    }

    return t("dota.share.friendText" as never, {
      url: buildDotaFriendInviteUrl(profile.slug, friendInviteToken)
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
  t: TranslateFn,
  friendInviteToken?: string
): Promise<boolean> {
  return copyTextToClipboard(buildDotaShareText(kind, profile, t, friendInviteToken));
}

export async function copyDotaTeamJoinUrl(slug: string, joinToken: string): Promise<boolean> {
  return copyTextToClipboard(buildDotaTeamJoinUrl(slug, joinToken));
}
