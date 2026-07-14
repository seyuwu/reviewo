import type { TranslateFn } from "@reviewo/i18n";

import { publicEnv } from "../../../lib/config/public-env";
import { copyTextToClipboard } from "../../growth/lib/share-urls";
import type { DotaProfile, DotaShareKind } from "../types/dota";

export function buildDotaProfileUrl(slug: string): string {
  return new URL(`/dota/${slug}`, publicEnv.siteUrl).toString();
}

/** Owner-shared link: opening while signed in auto-adds friendship (requires signed token). */
export function buildDotaFriendInviteUrl(slug: string, inviteToken: string): string {
  const url = new URL(`/dota/${slug}`, publicEnv.siteUrl);
  url.searchParams.set("friendInvite", inviteToken);
  return url.toString();
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

export function buildDotaTeamUrl(slug: string): string {
  return new URL(`/dota/teams/${slug}`, publicEnv.siteUrl).toString();
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

export function buildDotaTeamShareText(
  party: {
    kind?: "TEAM" | "PARTY";
    maxMembers: number;
    memberCount: number;
    name: string;
    slug: string;
  },
  t: TranslateFn
): string {
  const url = buildDotaTeamUrl(party.slug);

  if (party.kind === "PARTY") {
    return t("dota.team.shareTextParty" as never, { url });
  }

  return t("dota.team.shareTextTeam" as never, { url });
}

export async function copyDotaTeamShareText(
  party: {
    kind?: "TEAM" | "PARTY";
    maxMembers: number;
    memberCount: number;
    name: string;
    slug: string;
  },
  t: TranslateFn
): Promise<boolean> {
  return copyTextToClipboard(buildDotaTeamShareText(party, t));
}
