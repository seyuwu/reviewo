import type { DotaTournamentEntryMember, DotaTournamentStatus } from "./dota-tournament";

export interface TournamentRoom {
  entryId: string;
  name: string;
  description: string;
  status: string;
  joinMode: "OPEN" | "CONFIRM";
  phase: "TOURNAMENT" | "AFTERPARTY" | "CLOSED";
  expiresAt: string | null;
  serverNow: string;
  tournament: { slug: string; title: string; status: DotaTournamentStatus };
  members: Array<DotaTournamentEntryMember & { userId: string | null; hasLeft: boolean }>;
  isMember: boolean;
  isCaptain: boolean;
  canEditDescription: boolean;
  canReadChat: boolean;
  canWriteChat: boolean;
  canJoin: boolean;
  canLeave: boolean;
  canManageRoster: boolean;
  currentEntryId: string | null;
  pendingEntryId: string | null;
  pendingRole: string | null;
  voice: { channelId: string; guildId: string } | null;
}
export interface TournamentRoomMessage {
  id: string;
  body: string;
  senderUserId: string | null;
  senderName: string;
  createdAt: string;
}
export interface TournamentRoomMessages { messages: TournamentRoomMessage[]; nextCursor: string | null; }
export interface MyTournamentRoom {
  entryId: string;
  name: string;
  tournamentSlug: string;
  tournamentTitle: string;
  phase: "TOURNAMENT" | "AFTERPARTY";
  expiresAt: string | null;
}
