import { apiRequest } from "../../../lib/api/api-client";
import { tournamentPathSegment } from "./dota-tournaments-api";

export interface TournamentParticipationState {
  state: "NONE" | "WAITING" | "JOINED" | "REQUESTED" | "CLOSED" | "NEEDS_PROFILE";
  roles: string[];
  queueRoles: string[];
  sponsorRequired: boolean;
  sponsors: Array<{ id: string; name: string; url: string }>;
  entry: { id: string; name: string; status: string; joinMode: "OPEN" | "CONFIRM"; ownRole: string | null;
    members: Array<{ name: string; role: string | null; mmr: number | null }> } | null;
  request: { entryId: string; entryName: string; role: string } | null;
  suggestions: Array<{ entryId: string; name: string; role: string; memberCount: number; averageMmr: number | null }>;
}

export function getTournamentParticipation(slug: string, token: string) {
  return apiRequest<TournamentParticipationState>(`/dota/tournaments/${tournamentPathSegment(slug)}/participation`,
    { headers: { authorization: `Bearer ${token}` } });
}
export function startTournamentSoloSearch(slug: string, token: string, roles?: string[]) {
  return apiRequest<TournamentParticipationState>(`/dota/tournaments/${tournamentPathSegment(slug)}/participation/solo`,
    { method: "POST", body: roles ? { roles } : {}, headers: { authorization: `Bearer ${token}` } });
}
export function cancelTournamentSoloSearch(slug: string, token: string) {
  return apiRequest<TournamentParticipationState>(`/dota/tournaments/${tournamentPathSegment(slug)}/participation/cancel`,
    { method: "POST", headers: { authorization: `Bearer ${token}` } });
}
