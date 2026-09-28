import {
  DOTA_PARTY_RECRUIT_MMR_SPREAD,
  DOTA_POSITION_ROLES,
  isDotaPositionRole
} from "@reviewo/shared";

export interface DotaPartyMergeCandidate {
  createdAt: Date;
  discordChannelId: string | null;
  expiresAt: Date | null;
  id: string;
  joinMode: "OPEN" | "CONFIRM";
  lfgUntil: Date;
  maxMembers: number;
  members: Array<{ positionRole: string | null; userId: string }>;
  mmrBounds: Array<{ high: number; low: number }>;
  ownerUserId: string;
  pendingInviteCount: number;
  recruitedRoles: string[];
  servers: string[];
  slug: string;
}

export interface DotaPartyMergePlan {
  leaderCandidates: [string, string];
  recruitedRoles: string[];
  retiredPartyId: string;
  retiredPartySlug: string;
  survivorPartyId: string;
}

// Recruit windows are ±1500 around every member's MMR, so two parties can
// recruit each other when their compatible interval bounds are no more than 3000 apart.
const MAX_PARTY_MMR_SPREAD = DOTA_PARTY_RECRUIT_MMR_SPREAD * 2;

/**
 * Plans a merge only for two active, open recruiting parties whose current
 * rosters can coexist. Each surviving vacancy becomes searchable after merge.
 */
export function planDotaPartyMerge(
  left: DotaPartyMergeCandidate,
  right: DotaPartyMergeCandidate,
  now: Date
): DotaPartyMergePlan | null {
  if (left.id === right.id || left.joinMode !== "OPEN" || right.joinMode !== "OPEN") {
    return null;
  }

  if (
    left.pendingInviteCount > 0 ||
    right.pendingInviteCount > 0 ||
    left.discordChannelId ||
    right.discordChannelId ||
    left.lfgUntil.getTime() <= now.getTime() ||
    right.lfgUntil.getTime() <= now.getTime() ||
    left.expiresAt === null ||
    right.expiresAt === null ||
    left.expiresAt.getTime() <= now.getTime() ||
    right.expiresAt.getTime() <= now.getTime() ||
    left.recruitedRoles.length === 0 ||
    right.recruitedRoles.length === 0
  ) {
    return null;
  }

  const members = [...left.members, ...right.members];
  if (
    members.length < 2 ||
    members.length > Math.min(left.maxMembers, right.maxMembers) ||
    new Set(members.map((member) => member.userId)).size !== members.length ||
    !members.some((member) => member.userId === left.ownerUserId) ||
    !members.some((member) => member.userId === right.ownerUserId)
  ) {
    return null;
  }

  const occupiedRoles = members
    .map((member) => member.positionRole)
    .filter((role): role is string => role !== null);
  if (
    occupiedRoles.some((role) => !isDotaPositionRole(role)) ||
    new Set(occupiedRoles).size !== occupiedRoles.length
  ) {
    return null;
  }

  const mmrBounds = [...left.mmrBounds, ...right.mmrBounds];
  if (
    mmrBounds.length !== members.length ||
    mmrBounds.some(
      ({ low, high }) =>
        !Number.isFinite(low) || !Number.isFinite(high) || low < 0 || high > 18_000 || low > high
    ) ||
    Math.max(...mmrBounds.map((bounds) => bounds.high)) -
      Math.min(...mmrBounds.map((bounds) => bounds.low)) >
      MAX_PARTY_MMR_SPREAD
  ) {
    return null;
  }

  const servers = new Set(
    [...left.servers, ...right.servers].map((server) => server.trim()).filter(Boolean)
  );
  if (servers.size > 1) {
    return null;
  }

  // The older party keeps its URL and chat. Vacant roles remain in recruitment.
  const survivor = comparePartyAge(left, right) <= 0 ? left : right;
  const retired = survivor.id === left.id ? right : left;
  const claimed = new Set(occupiedRoles);

  return {
    leaderCandidates: [left.ownerUserId, right.ownerUserId],
    recruitedRoles: DOTA_POSITION_ROLES.filter((role) => !claimed.has(role)),
    retiredPartyId: retired.id,
    retiredPartySlug: retired.slug,
    survivorPartyId: survivor.id
  };
}

function comparePartyAge(left: DotaPartyMergeCandidate, right: DotaPartyMergeCandidate): number {
  const ageDelta = left.createdAt.getTime() - right.createdAt.getTime();
  return ageDelta === 0 ? left.id.localeCompare(right.id) : ageDelta;
}
