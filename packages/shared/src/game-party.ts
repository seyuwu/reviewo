export const DOTA_PARTY_SIZE = 5;
export const DOTA_PARTY_VERTICAL = "dota" as const;
/** Temporary stack/party lifetime */
export const DOTA_TEMP_PARTY_TTL_HOURS = 12;
/** Pending INVITE / APPLICATION auto-cancel after this age */
export const DOTA_PARTY_INVITE_TTL_HOURS = 3;

export const DOTA_POSITION_ROLES = ["1", "2", "3", "4", "5"] as const;
export type DotaPositionRole = (typeof DOTA_POSITION_ROLES)[number];

export function isDotaPositionRole(value: string): value is DotaPositionRole {
  return (DOTA_POSITION_ROLES as readonly string[]).includes(value);
}

export type DotaFriendshipStatus = "none" | "outgoing" | "incoming" | "friends" | "self";

export type GamePartyKind = "TEAM" | "PARTY";
export type GamePartyMemberRole = "OWNER" | "MEMBER";
export type GamePartyVisibility = "PUBLIC" | "PRIVATE";
export type FriendshipStatusValue = "PENDING" | "ACCEPTED" | "DECLINED" | "BLOCKED";
export type PartyInviteStatusValue = "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED";

const DOTA_PARTY_NAME_PREFIXES = [
  "Radiant",
  "Dire",
  "Ancient",
  "Shadow",
  "Arcane",
  "Brutal",
  "Swift",
  "Iron",
  "Mystic",
  "Wild",
  "Silent",
  "Broken"
] as const;

const DOTA_PARTY_NAME_SUBJECTS = [
  "Juggernauts",
  "Invokers",
  "Pudges",
  "Anti-Mages",
  "Snipers",
  "Axes",
  "Crystal Maidens",
  "Linas",
  "Phantoms",
  "Techies",
  "Roshan Slayers",
  "Fountain Divers",
  "Rapiers",
  "Aghanims",
  "Smoke Gank",
  "High Ground",
  "BKB Stack",
  "Clockwerks",
  "Pucksters",
  "Wraths"
] as const;

export function generateDotaPartyName(): string {
  const prefix = pickRandom(DOTA_PARTY_NAME_PREFIXES);
  const subject = pickRandom(DOTA_PARTY_NAME_SUBJECTS);
  return `${prefix} ${subject}`;
}

function pickRandom<T extends string>(values: readonly T[]): T {
  return values[Math.floor(Math.random() * values.length)] ?? values[0]!;
}
