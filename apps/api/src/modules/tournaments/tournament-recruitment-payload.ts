export interface TournamentTeamInvitePayload {
  type: "tournament_team_invite";
  tournamentId: string; tournamentSlug: string; tournamentTitle: string;
  entryId: string; entryName: string; senderUserId: string; senderName: string;
  targetUserId: string; queueId: string; generation: number; roles: string[]; expiresAt: string;
}

export function readTournamentTeamInvite(value: unknown): TournamentTeamInvitePayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (payload["type"] !== "tournament_team_invite" ||
    ["tournamentId", "entryId", "senderUserId", "targetUserId", "queueId"].some(key => typeof payload[key] !== "string" || !uuid.test(payload[key] as string)) ||
    ["tournamentSlug", "tournamentTitle", "entryName", "senderName", "expiresAt"].some(key => typeof payload[key] !== "string") ||
    !Number.isInteger(payload["generation"]) || Number(payload["generation"]) < 1 || !Array.isArray(payload["roles"]) ||
    !payload["roles"].length || payload["roles"].some(role => typeof role !== "string" || !["1", "2", "3", "4", "5"].includes(role)) ||
    !Number.isFinite(Date.parse(payload["expiresAt"] as string))) return null;
  return payload as unknown as TournamentTeamInvitePayload;
}
