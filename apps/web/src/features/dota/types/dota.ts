export interface DotaProfileProgress {
  current: number;
  target: number;
}

export interface DotaProfile {
  dotaAccountId: string;
  entityId: string;
  friendshipRequestId: string | null;
  friendshipStatus: "none" | "outgoing" | "incoming" | "friends" | "self" | null;
  gender: string | null;
  hasMic: boolean | null;
  isOwner: boolean;
  language: string | null;
  mmr: string | null;
  ownerUserId: string | null;
  playIntent: string | null;
  matchMode: "auto" | "manual" | null;
  progress: DotaProfileProgress;
  qualities: Record<string, number>;
  roles: string[];
  server: string | null;
  slug: string;
  title: string;
}

export interface CreateDotaProfileInput {
  dotaAccountId?: string;
  gender?: "female" | "male" | "unspecified";
  hasMic?: boolean;
  language?: string;
  mmr?: string;
  playIntent?: "fun" | "ranked" | "tournament";
  matchMode?: "auto" | "manual";
  roles?: string[];
  server?: string;
  slug?: string;
  title?: string;
}

export type DotaShareKind = "profile" | "confirm" | "id" | "friend";
