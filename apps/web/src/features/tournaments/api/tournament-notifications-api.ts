import { apiRequest } from "../../../lib/api/api-client";

export interface TournamentDisputeNotification {
  id: string;
  eventId: string;
  tournamentTitle: string;
  teams: string;
  reason: string;
  href: string;
}
export function fetchTournamentNotifications(token: string) {
  return apiRequest<{ items: TournamentDisputeNotification[]; count: number; mentions?: TournamentDisputeNotification[]; mentionCount?: number }>("/dota/tournament-notifications", {
    headers: { authorization: "Bearer " + token }, cache: "no-store"
  });
}
export function readMatchMention(id: string, token: string) {
  return apiRequest<unknown>("/dota/tournament-notifications/mentions/" + encodeURIComponent(id) + "/read", {
    headers: { authorization: "Bearer " + token }, method: "POST"
  });
}
