import { apiRequest } from "../../../lib/api/api-client";
import type {
  AdminDotaTournamentMatch,
  DotaTournament,
  DotaTournamentMatch,
  DotaTournamentSummary,
  DotaTournamentTeamEntry,
  DotaTournamentStatus
} from "../types/dota-tournament";

function authHeaders(accessToken: string) {
  return { authorization: `Bearer ${accessToken}` };
}

export function fetchDotaTournaments(): Promise<DotaTournamentSummary[]> {
  return apiRequest<DotaTournamentSummary[]>("/dota/tournaments");
}

export function fetchDotaTournament(slug: string): Promise<DotaTournament> {
  return apiRequest<DotaTournament>(`/dota/tournaments/${encodeURIComponent(slug)}`);
}

export function fetchDotaTournamentMatch(
  tournamentSlug: string,
  matchId: string,
  accessToken: string
): Promise<DotaTournamentMatch> {
  return apiRequest<DotaTournamentMatch>(
    `/dota/tournaments/${encodeURIComponent(tournamentSlug)}/matches/${encodeURIComponent(matchId)}`,
    { headers: authHeaders(accessToken) }
  );
}

export function submitDotaTournamentLobby(
  tournamentSlug: string,
  matchId: string,
  body: {
    allowSpectators: boolean;
    cheatsEnabled: boolean;
    gameMode: string;
    lobbyName: string;
    lobbyPassword: string;
    lobbyProofUrl?: string;
    serverRegion: string;
  },
  accessToken: string
): Promise<DotaTournamentMatch> {
  return apiRequest<DotaTournamentMatch>(
    `/dota/tournaments/${encodeURIComponent(tournamentSlug)}/matches/${encodeURIComponent(matchId)}/lobby`,
    { body, headers: authHeaders(accessToken), method: "POST" }
  );
}

async function postMatchAction(
  tournamentSlug: string,
  matchId: string,
  action: string,
  accessToken: string,
  body?: unknown
): Promise<DotaTournamentMatch> {
  return apiRequest<DotaTournamentMatch>(
    `/dota/tournaments/${encodeURIComponent(tournamentSlug)}/matches/${encodeURIComponent(matchId)}/${action}`,
    { ...(body ? { body } : {}), headers: authHeaders(accessToken), method: "POST" }
  );
}

export function confirmDotaTournamentLobby(slug: string, matchId: string, token: string) {
  return postMatchAction(slug, matchId, "confirm-lobby", token);
}

export function startDotaTournamentMatch(slug: string, matchId: string, token: string) {
  return postMatchAction(slug, matchId, "start", token);
}

export function submitDotaTournamentResult(
  slug: string,
  matchId: string,
  winnerEntryId: string,
  evidenceUrl: string,
  token: string
) {
  return postMatchAction(slug, matchId, "result", token, {
    winnerEntryId,
    ...(evidenceUrl.trim() ? { evidenceUrl: evidenceUrl.trim() } : {})
  });
}

export function confirmDotaTournamentResult(slug: string, matchId: string, token: string) {
  return postMatchAction(slug, matchId, "confirm-result", token);
}

export function disputeDotaTournamentMatch(
  slug: string,
  matchId: string,
  reason: string,
  token: string
) {
  return postMatchAction(slug, matchId, "dispute", token, { reason });
}

export function fetchDotaTeamTournamentEntries(
  teamSlug: string,
  accessToken: string
): Promise<DotaTournamentTeamEntry[]> {
  return apiRequest<DotaTournamentTeamEntry[]>(
    `/dota/tournaments/teams/${encodeURIComponent(teamSlug)}/entries`,
    { headers: authHeaders(accessToken) }
  );
}

export function registerDotaTeamForTournament(
  tournamentSlug: string,
  teamSlug: string,
  accessToken: string,
  joinMode: "OPEN" | "CONFIRM"
): Promise<DotaTournament> {
  return apiRequest<DotaTournament>(
    `/dota/tournaments/${encodeURIComponent(tournamentSlug)}/entries`,
    {
      body: { joinMode, teamSlug },
      headers: authHeaders(accessToken),
      method: "POST"
    }
  );
}

export function withdrawDotaTeamFromTournament(
  tournamentSlug: string,
  entryId: string,
  accessToken: string
): Promise<DotaTournament> {
  return apiRequest<DotaTournament>(
    `/dota/tournaments/${encodeURIComponent(tournamentSlug)}/entries/${encodeURIComponent(entryId)}`,
    { headers: authHeaders(accessToken), method: "DELETE" }
  );
}

export function joinDotaTournamentEntry(
  tournamentSlug: string,
  entryId: string,
  positionRole: "1" | "2" | "3" | "4" | "5",
  accessToken: string
): Promise<{ entryId: string; result: "JOINED" | "REQUESTED"; tournament: DotaTournament }> {
  return apiRequest<{ entryId: string; result: "JOINED" | "REQUESTED"; tournament: DotaTournament }>(
    `/dota/tournaments/${encodeURIComponent(tournamentSlug)}/entries/${encodeURIComponent(entryId)}/join`,
    {
      body: { positionRole },
      headers: authHeaders(accessToken),
      method: "POST"
    }
  );
}

export function decideDotaTournamentJoinRequest(
  tournamentSlug: string,
  entryId: string,
  requestId: string,
  decision: "ACCEPT" | "DECLINE",
  accessToken: string
): Promise<{ ok: true; tournament: DotaTournament }> {
  return apiRequest<{ ok: true; tournament: DotaTournament }>(
    `/dota/tournaments/${encodeURIComponent(tournamentSlug)}/entries/${encodeURIComponent(entryId)}/requests/${encodeURIComponent(requestId)}`,
    {
      body: { decision },
      headers: authHeaders(accessToken),
      method: "PATCH"
    }
  );
}

export function setDotaTournamentEntryJoinMode(
  tournamentSlug: string,
  entryId: string,
  joinMode: "OPEN" | "CONFIRM",
  accessToken: string
): Promise<{ joinMode: "OPEN" | "CONFIRM"; ok: true }> {
  return apiRequest<{ joinMode: "OPEN" | "CONFIRM"; ok: true }>(
    `/dota/tournaments/${encodeURIComponent(tournamentSlug)}/entries/${encodeURIComponent(entryId)}/join-mode`,
    {
      body: { joinMode },
      headers: authHeaders(accessToken),
      method: "PATCH"
    }
  );
}

export function leaveDotaTournamentEntry(
  tournamentSlug: string,
  entryId: string,
  accessToken: string
): Promise<{ ok: true; tournament: DotaTournament }> {
  return apiRequest<{ ok: true; tournament: DotaTournament }>(
    `/dota/tournaments/${encodeURIComponent(tournamentSlug)}/entries/${encodeURIComponent(entryId)}/members/me`,
    { headers: authHeaders(accessToken), method: "DELETE" }
  );
}

export interface AdminDotaTournamentInput {
  allowSpectators?: boolean;
  cheatsEnabled?: boolean;
  description?: string;
  format?: string;
  gameMode?: string;
  maxTeams?: number;
  registrationClosesAt?: string;
  rulesUrl?: string;
  serverRegion?: string;
  slug?: string;
  startsAt?: string;
  status?: DotaTournamentStatus;
  title: string;
}

export interface AdminDotaTournamentMatchInput {
  entryAId: string;
  entryBId: string;
  hostSide: "A" | "B";
  matchNumber: number;
  roundNumber: number;
  scheduledAt: string;
  streamUrl?: string;
}

export function fetchAdminDotaTournaments(accessToken: string): Promise<DotaTournamentSummary[]> {
  return apiRequest<DotaTournamentSummary[]>("/dota/tournament-management", {
    headers: authHeaders(accessToken)
  });
}

export function createAdminDotaTournament(
  input: AdminDotaTournamentInput,
  accessToken: string
): Promise<DotaTournamentSummary> {
  return apiRequest<DotaTournamentSummary>("/dota/tournament-management", {
    body: input,
    headers: authHeaders(accessToken),
    method: "POST"
  });
}

export function updateAdminDotaTournament(
  slug: string,
  input: Partial<AdminDotaTournamentInput>,
  accessToken: string
): Promise<DotaTournamentSummary> {
  return apiRequest<DotaTournamentSummary>(
    `/dota/tournament-management/${encodeURIComponent(slug)}`,
    { body: input, headers: authHeaders(accessToken), method: "PATCH" }
  );
}

export function fetchAdminDotaTournamentMatches(
  slug: string,
  accessToken: string
): Promise<AdminDotaTournamentMatch[]> {
  return apiRequest<AdminDotaTournamentMatch[]>(
    `/dota/tournament-management/${encodeURIComponent(slug)}/matches`,
    { headers: authHeaders(accessToken) }
  );
}

export function createAdminDotaTournamentMatch(
  slug: string,
  input: AdminDotaTournamentMatchInput,
  accessToken: string
): Promise<AdminDotaTournamentMatch> {
  return apiRequest<AdminDotaTournamentMatch>(
    `/dota/tournament-management/${encodeURIComponent(slug)}/matches`,
    { body: input, headers: authHeaders(accessToken), method: "POST" }
  );
}

export function resolveAdminDotaTournamentMatch(
  matchId: string,
  resolution: "ENTRY_A" | "ENTRY_B" | "REPLAY" | "CANCEL",
  note: string,
  accessToken: string
): Promise<AdminDotaTournamentMatch> {
  return apiRequest<AdminDotaTournamentMatch>(
    `/dota/tournament-management/matches/${encodeURIComponent(matchId)}/resolve`,
    {
      body: { note, resolution },
      headers: authHeaders(accessToken),
      method: "POST"
    }
  );
}
