import { apiRequest } from "../../../lib/api/api-client";
import { tournamentPathSegment } from "./dota-tournaments-api";

export interface TournamentRecruitmentBoard {
  entryId: string; name: string; status: string; needed: boolean; enabled: boolean; freeRoles: string[];
  players: Array<{ queueId: string; generation: number; name: string; profileSlug: string; mmr: number | null; roles: string[]; positions: string[]; startedAt: string }>;
}
export interface TournamentRecruitInvitation {
  id: string; tournamentId: string; tournamentSlug: string; tournamentTitle: string;
  entryId: string; name: string; status: string; senderName: string; roles: string[]; joinMode: "OPEN" | "CONFIRM"; expiresAt: string;
}
const entryPath = (slug: string, entryId: string) => `/dota/tournaments/${tournamentPathSegment(slug)}/entries/${encodeURIComponent(entryId)}/recruitment`;
const headers = (token: string) => ({ authorization: `Bearer ${token}` });
export function fetchTournamentRecruitment(slug: string, entryId: string, token: string) {
  return apiRequest<TournamentRecruitmentBoard>(entryPath(slug, entryId), { headers: headers(token) });
}
export function setTournamentRecruitment(slug: string, entryId: string, token: string, enabled: boolean) {
  return apiRequest<TournamentRecruitmentBoard>(entryPath(slug, entryId) + "/search", { method: "POST", headers: headers(token), body: { enabled } });
}
export function inviteTournamentRecruit(slug: string, entryId: string, token: string, queueId: string, generation: number, positionRole: string) {
  return apiRequest<{ queued: true }>(entryPath(slug, entryId) + "/invite", { method: "POST", headers: headers(token), body: { queueId, generation, positionRole } });
}
export function fetchTournamentRecruitInvitation(slug: string, id: string, token: string) {
  return apiRequest<TournamentRecruitInvitation>(`/dota/tournaments/${tournamentPathSegment(slug)}/participation/invites/${encodeURIComponent(id)}`, { headers: headers(token) });
}
export function acceptTournamentRecruitInvitation(slug: string, id: string, token: string, positionRole: string) {
  return apiRequest<{ entryId: string }>(`/dota/tournaments/${tournamentPathSegment(slug)}/participation/invites/${encodeURIComponent(id)}/accept`,
    { method: "POST", headers: headers(token), body: { positionRole } });
}
