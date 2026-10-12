import { apiRequest } from "../../../lib/api/api-client";
import { tournamentPathSegment } from "./dota-tournaments-api";

export interface TournamentParticipationState {
  state: "NONE" | "WAITING" | "JOINED" | "REQUESTED" | "CLOSED" | "NEEDS_PROFILE";
  roles: string[];
  queueRoles: string[];
  queueMode: "BOARD" | "AUTO" | null;
  sponsorRequired: boolean;
  sponsors: Array<{ id: string; name: string; url: string }>;
  entry: { id: string; name: string; status: string; joinMode: "OPEN" | "CONFIRM"; ownRole: string | null; isCaptain: boolean; recruiting: boolean;
    members: Array<{ name: string; role: string | null; mmr: number | null; telegramUsername?: string | null }> } | null;
  request: { entryId: string; entryName: string; role: string } | null;
  requests?: Array<{ id: string; entryId: string; entryName: string; role: string }>;
  suggestions: Array<{ entryId: string; name: string; status: string; role: string; freeRoles: string[]; joinMode: "OPEN" | "CONFIRM"; memberCount: number; averageMmr: number | null }>;
}

export function getTournamentParticipation(slug: string, token: string) {
  return apiRequest<TournamentParticipationState>(`/dota/tournaments/${tournamentPathSegment(slug)}/participation`,
    { headers: { authorization: `Bearer ${token}` } });
}
export function startTournamentSoloSearch(slug: string, token: string, roles?: string[], mode: "BOARD" | "AUTO" = "AUTO") {
  return apiRequest<TournamentParticipationState>(`/dota/tournaments/${tournamentPathSegment(slug)}/participation/solo`,
    { method: "POST", body: roles ? { roles, mode } : { mode }, headers: { authorization: `Bearer ${token}` } });
}
export function cancelTournamentSoloSearch(slug: string, token: string) {
  return apiRequest<TournamentParticipationState>(`/dota/tournaments/${tournamentPathSegment(slug)}/participation/cancel`,
    { method: "POST", headers: { authorization: `Bearer ${token}` } });
}
export function cancelTournamentApplication(slug: string, requestId: string, token: string) {
  return apiRequest<TournamentParticipationState>(`/dota/tournaments/${tournamentPathSegment(slug)}/participation/requests/${tournamentPathSegment(requestId)}/cancel`,
    { method: "POST", headers: { authorization: `Bearer ${token}` } });
}
