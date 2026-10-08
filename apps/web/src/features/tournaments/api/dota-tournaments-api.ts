import { apiRequest } from "../../../lib/api/api-client";
import type {
  AdminDotaTournamentMatch,
  DotaTournament,
  DotaTournamentManagedEntry,
  DotaTournamentMatch,
  PublicDotaTournamentMatch,
  DotaTournamentSummary,
  DotaTournamentTeamEntry,
  DotaTournamentStatus
} from "../types/dota-tournament";

function authHeaders(accessToken: string) {
  return { authorization: `Bearer ${accessToken}` };
}

// Route params can still contain percent-encoded Cyrillic in Next.js.
// Canonical slugs contain only letters, numbers and hyphens.
export function tournamentPathSegment(slug: string) {
  try {
    return encodeURIComponent(decodeURIComponent(slug));
  } catch {
    return encodeURIComponent(slug);
  }
}

export function fetchDotaTournaments(): Promise<DotaTournamentSummary[]> {
  return apiRequest<DotaTournamentSummary[]>("/dota/tournaments");
}

export function fetchDotaTournament(slug: string, accessToken?: string): Promise<DotaTournament> {
  return apiRequest<DotaTournament>(
    `/dota/tournaments/${tournamentPathSegment(slug)}`,
    accessToken ? { headers: authHeaders(accessToken) } : undefined
  );
}

export function recordDotaTournamentSponsorClick(
  tournamentSlug: string,
  sponsorId: string,
  accessToken: string
): Promise<{ sponsorGateCompleted: boolean }> {
  return apiRequest<{ sponsorGateCompleted: boolean }>(
    `/dota/tournaments/${tournamentPathSegment(tournamentSlug)}/sponsors/${encodeURIComponent(sponsorId)}/click`,
    { headers: authHeaders(accessToken), method: "POST" }
  );
}

export function fetchDotaTournamentMatch(
  tournamentSlug: string,
  matchId: string,
  accessToken: string
): Promise<DotaTournamentMatch> {
  return apiRequest<DotaTournamentMatch>(
    `/dota/tournaments/${tournamentPathSegment(tournamentSlug)}/matches/${encodeURIComponent(matchId)}`,
    { headers: authHeaders(accessToken) }
  );
}

export function fetchPublicDotaTournamentMatch(
  tournamentSlug: string,
  matchId: string,
  accessToken?: string
): Promise<PublicDotaTournamentMatch> {
  return apiRequest<PublicDotaTournamentMatch>(
    `/dota/tournaments/${tournamentPathSegment(tournamentSlug)}/matches/${encodeURIComponent(matchId)}/public`,
    accessToken ? { headers: authHeaders(accessToken) } : undefined
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
    `/dota/tournaments/${tournamentPathSegment(tournamentSlug)}/matches/${encodeURIComponent(matchId)}/lobby`,
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
    `/dota/tournaments/${tournamentPathSegment(tournamentSlug)}/matches/${encodeURIComponent(matchId)}/${action}`,
    { ...(body ? { body } : {}), headers: authHeaders(accessToken), method: "POST" }
  );
}

export function confirmDotaTournamentLobby(slug: string, matchId: string, token: string) {
  return postMatchAction(slug, matchId, "confirm-lobby", token, { playersReady: true });
}

export function startDotaTournamentMatch(slug: string, matchId: string, token: string) {
  return postMatchAction(slug, matchId, "start", token);
}

export function submitDotaTournamentMatchGameId(
  slug: string,
  matchId: string,
  dotaMatchId: string,
  token: string,
  gameNumber?: number
) {
  return postMatchAction(slug, matchId, "game-id", token, { dotaMatchId, ...(gameNumber === undefined ? {} : { gameNumber }) });
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

export function fetchDotaTournamentManagedEntries(
  tournamentSlug: string,
  accessToken: string
): Promise<DotaTournamentManagedEntry[]> {
  return apiRequest<DotaTournamentManagedEntry[]>(
    `/dota/tournaments/${tournamentPathSegment(tournamentSlug)}/managed-entries`,
    { headers: authHeaders(accessToken) }
  );
}

export function createDotaTournamentSquad(
  tournamentSlug: string,
  input: {
    joinMode: "OPEN" | "CONFIRM";
    name: string;
    positionRole: "1" | "2" | "3" | "4" | "5";
  },
  accessToken: string
): Promise<DotaTournament> {
  return apiRequest<DotaTournament>(
    `/dota/tournaments/${tournamentPathSegment(tournamentSlug)}/squads`,
    { body: input, headers: authHeaders(accessToken), method: "POST" }
  );
}

export function registerDotaTeamForTournament(
  tournamentSlug: string,
  teamSlug: string,
  accessToken: string,
  joinMode: "OPEN" | "CONFIRM"
): Promise<DotaTournament> {
  return apiRequest<DotaTournament>(
    `/dota/tournaments/${tournamentPathSegment(tournamentSlug)}/entries`,
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
    `/dota/tournaments/${tournamentPathSegment(tournamentSlug)}/entries/${encodeURIComponent(entryId)}`,
    { headers: authHeaders(accessToken), method: "DELETE" }
  );
}

export function joinDotaTournamentEntry(
  tournamentSlug: string,
  entryId: string,
  positionRole: "1" | "2" | "3" | "4" | "5",
  accessToken: string
): Promise<{ entryId: string; result: "JOINED" | "REQUESTED"; tournament: DotaTournament }> {
  return apiRequest<{
    entryId: string;
    result: "JOINED" | "REQUESTED";
    tournament: DotaTournament;
  }>(
    `/dota/tournaments/${tournamentPathSegment(tournamentSlug)}/entries/${encodeURIComponent(entryId)}/join`,
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
    `/dota/tournaments/${tournamentPathSegment(tournamentSlug)}/entries/${encodeURIComponent(entryId)}/requests/${encodeURIComponent(requestId)}`,
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
    `/dota/tournaments/${tournamentPathSegment(tournamentSlug)}/entries/${encodeURIComponent(entryId)}/join-mode`,
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
    `/dota/tournaments/${tournamentPathSegment(tournamentSlug)}/entries/${encodeURIComponent(entryId)}/members/me`,
    { headers: authHeaders(accessToken), method: "DELETE" }
  );
}

export function assignDotaTournamentEntryPosition(
  tournamentSlug: string,
  entryId: string,
  positionRole: string,
  accessToken: string
): Promise<DotaTournament> {
  return apiRequest<DotaTournament>(
    `/dota/tournaments/${tournamentPathSegment(tournamentSlug)}/entries/${encodeURIComponent(entryId)}/members/me/position`,
    { body: { positionRole }, headers: authHeaders(accessToken), method: "PATCH" }
  );
}

export interface AdminDotaTournamentInput {
  automaticBracket?: boolean;
  bracketFormat?: "SINGLE_ELIMINATION" | "DOUBLE_ELIMINATION";
  allowSpectators?: boolean;
  cheatsEnabled?: boolean;
  description?: string;
  format?: string | null;
  gameMode?: string;
  maxTeams?: number | null;
  registrationClosesAt?: string | null;
  rulesUrl?: string | null;
  sponsors?: Array<{ name: string; url: string; logoUrl?: string | null }>;
  serverRegion?: string;
  slug?: string | null;
  startsAt?: string | null;
  status?: DotaTournamentStatus;
  title: string;
}

export interface AdminDotaTournamentMatchInput {
  bestOf?: 1 | 3 | 5;
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
    `/dota/tournament-management/${tournamentPathSegment(slug)}`,
    { body: input, headers: authHeaders(accessToken), method: "PATCH" }
  );
}

export function fetchAdminDotaTournamentMatches(
  slug: string,
  accessToken: string
): Promise<AdminDotaTournamentMatch[]> {
  return apiRequest<AdminDotaTournamentMatch[]>(
    `/dota/tournament-management/${tournamentPathSegment(slug)}/matches`,
    { headers: authHeaders(accessToken) }
  );
}

export function confirmManagedDotaTournamentStage(
  slug: string,
  matchId: string,
  stage: "LOBBY" | "RESULT",
  side: "A" | "B",
  accessToken: string
): Promise<AdminDotaTournamentMatch> {
  return apiRequest<AdminDotaTournamentMatch>(
    `/dota/tournament-management/${tournamentPathSegment(slug)}/matches/${encodeURIComponent(matchId)}/confirm-stage`,
    { body: { side, stage }, headers: authHeaders(accessToken), method: "POST" }
  );
}

export function submitManagedDotaTournamentLobby(
  slug: string,
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
): Promise<AdminDotaTournamentMatch> {
  return apiRequest<AdminDotaTournamentMatch>(
    `/dota/tournament-management/${tournamentPathSegment(slug)}/matches/${encodeURIComponent(matchId)}/lobby`,
    { body, headers: authHeaders(accessToken), method: "POST" }
  );
}

export function startManagedDotaTournamentMatch(
  slug: string,
  matchId: string,
  accessToken: string
): Promise<AdminDotaTournamentMatch> {
  return apiRequest<AdminDotaTournamentMatch>(
    `/dota/tournament-management/${tournamentPathSegment(slug)}/matches/${encodeURIComponent(matchId)}/start`,
    { headers: authHeaders(accessToken), method: "POST" }
  );
}

export function submitManagedDotaTournamentMatchGameId(
  slug: string,
  matchId: string,
  dotaMatchId: string,
  accessToken: string,
  gameNumber?: number
): Promise<AdminDotaTournamentMatch> {
  return apiRequest<AdminDotaTournamentMatch>(
    `/dota/tournament-management/${tournamentPathSegment(slug)}/matches/${encodeURIComponent(matchId)}/game-id`,
    { body: { dotaMatchId, ...(gameNumber === undefined ? {} : { gameNumber }) }, headers: authHeaders(accessToken), method: "POST" }
  );
}

export function createAdminDotaTournamentMatch(
  slug: string,
  input: AdminDotaTournamentMatchInput,
  accessToken: string
): Promise<AdminDotaTournamentMatch> {
  return apiRequest<AdminDotaTournamentMatch>(
    `/dota/tournament-management/${tournamentPathSegment(slug)}/matches`,
    { body: input, headers: authHeaders(accessToken), method: "POST" }
  );
}

export function resolveAdminDotaTournamentMatch(
  matchId: string,
  resolution: "ENTRY_A" | "ENTRY_B" | "ENTRY_A_SERIES" | "ENTRY_B_SERIES" | "REPLAY" | "CANCEL",
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

export function replaceDotaTournamentMatchSideWithReserve(
  slug: string,
  matchId: string,
  side: "A" | "B",
  reserveEntryId: string,
  accessToken: string
): Promise<AdminDotaTournamentMatch> {
  return apiRequest<AdminDotaTournamentMatch>(
    `/dota/tournament-management/${tournamentPathSegment(slug)}/matches/${encodeURIComponent(matchId)}/replace-reserve`,
    {
      body: { reserveEntryId, side },
      headers: authHeaders(accessToken),
      method: "POST"
    }
  );
}
