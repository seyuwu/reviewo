import type { TranslateFn } from "@reviewo/i18n";

import { copyTextToClipboard } from "../../growth/lib/share-urls";
import { getDotaPublicOrigin } from "../../../lib/config/product-hosts";
import { recordPartyLinkOpen as recordPartyLinkOpenApi } from "../../social/api/social-api";
import type { DotaPositionRole, GameParty, GamePartyMember } from "../../social/types/social";
import { buildDotaTeamJoinUrl, buildDotaTeamUrl } from "./share";

/** Max MMR gap between party members and recruits (Dota party queue uses a similar band). */
export const PARTY_RECRUIT_MMR_SPREAD = 1500;

export function computePartyRecruitMmrRange(
  members: Pick<GamePartyMember, "mmr">[]
): { max: number; min: number } | null {
  const values = members
    .map((member) => Number(member.mmr))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (values.length === 0) {
    return null;
  }

  const partyMin = Math.min(...values);
  const partyMax = Math.max(...values);

  return {
    min: Math.max(0, partyMax - PARTY_RECRUIT_MMR_SPREAD),
    max: partyMin + PARTY_RECRUIT_MMR_SPREAD
  };
}

function partyInviteDisplayHost(): string {
  try {
    const { hostname, port } = new URL(getDotaPublicOrigin());

    if (hostname === "dota.opinia.ru" || hostname === "opinia.ru" || hostname === "www.opinia.ru") {
      return "dota.opinia.ru";
    }

    return port ? `${hostname}:${port}` : hostname;
  } catch {
    return "dota.opinia.ru";
  }
}

export function buildDotaPartyInviteMessage(
  party: Pick<GameParty, "maxMembers" | "memberCount" | "members">,
  joinUrl: string,
  t: TranslateFn,
  neededRoles: DotaPositionRole[] = []
): string {
  const need = Math.max(0, party.maxMembers - party.memberCount);
  const roleLine =
    neededRoles.length > 0 ? [...neededRoles].sort().join(",") : null;
  const mmrRange = computePartyRecruitMmrRange(party.members);

  const lines = [
    t("dota.team.inviteMessageTitle", { count: String(need) }),
    mmrRange
      ? t("dota.team.inviteMessageMmr", {
          max: String(mmrRange.max),
          min: String(mmrRange.min)
        })
      : null,
    roleLine ? t("dota.team.inviteMessageRoles", { roles: roleLine }) : null,
    t("dota.team.inviteMessageLink"),
    "",
    joinUrl
  ].filter((line): line is string => line !== null);

  return lines.join("\n");
}

export async function copyDotaPartyInviteMessage(
  party: Pick<GameParty, "maxMembers" | "memberCount" | "members" | "slug">,
  joinToken: string | null,
  t: TranslateFn,
  neededRoles: DotaPositionRole[] = []
): Promise<{ message: string; ok: boolean; url: string }> {
  const prepared = prepareDotaPartyInvite(party, joinToken, t, neededRoles);
  const ok = await copyTextToClipboard(prepared.message);
  return { ...prepared, ok };
}

export function prepareDotaPartyInvite(
  party: Pick<GameParty, "maxMembers" | "memberCount" | "members" | "slug">,
  joinToken: string | null,
  t: TranslateFn,
  neededRoles: DotaPositionRole[] = []
): { message: string; url: string } {
  const url = joinToken
    ? buildDotaTeamJoinUrl(party.slug, joinToken)
    : buildDotaTeamUrl(party.slug);
  const message = buildDotaPartyInviteMessage(party, url, t, neededRoles);
  return { message, url };
}

export function buildPartyShortDisplayUrl(slug: string, joinCode?: string | null): string {
  const host = partyInviteDisplayHost();

  if (joinCode && /^[A-Za-z0-9_-]{6,16}$/.test(joinCode) && !joinCode.includes(".")) {
    return `${host}/j/${joinCode}`;
  }

  const short = slug.replace(/^party-/, "").slice(0, 24);
  return `${host}/p/${short}`;
}

/** Guest/landing view: report once per browser session; server soft-dedupes by IP/user. */
export async function reportPartyLinkOpen(
  slug: string,
  accessToken?: string
): Promise<number | null> {
  if (typeof window === "undefined") {
    return null;
  }

  const sessionKey = `opinia.partyLinkOpenSession:${slug}`;
  try {
    if (window.sessionStorage.getItem(sessionKey) === "1") {
      return null;
    }
    window.sessionStorage.setItem(sessionKey, "1");
  } catch {
    // continue without session gate
  }

  try {
    const result = await recordPartyLinkOpenApi(slug, accessToken);
    return result.linkOpenCount;
  } catch {
    return null;
  }
}
