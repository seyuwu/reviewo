import { apiRequest } from "../../../lib/api/api-client";
import { tournamentPathSegment } from "./dota-tournaments-api";
import type { AdminDotaTournamentMatch } from "../types/dota-tournament";
export interface MatchChatMessage {
  id: string; userId: string; displayName: string; message: string; createdAt: string;
  mentions: Array<{ userId: string; displayName: string; notified: boolean }>;
}
export interface MatchChatPage {
  messages: MatchChatMessage[]; nextCursor: string | null;
  targets: Array<{ userId: string; displayName: string }>;
}
const headers = (token: string) => ({ authorization: "Bearer " + token });
const path = (slug: string, id: string) => "/dota/tournaments/" + tournamentPathSegment(slug) + "/matches/" + encodeURIComponent(id) + "/chat";
export function fetchMatchChat(slug: string, id: string, token: string, before?: string) {
  return apiRequest<MatchChatPage>(path(slug, id) + (before ? "?before=" + encodeURIComponent(before) : ""),
    { headers: headers(token), cache: "no-store" });
}
export function sendMatchChat(slug: string, id: string, token: string, message: string, mentionUserIds: string[]) {
  return apiRequest<MatchChatMessage>(path(slug, id), { headers: headers(token), method: "POST", body: { message, mentionUserIds } });
}
export function fetchStaffMatch(slug: string, id: string, token: string) {
  return apiRequest<AdminDotaTournamentMatch>("/dota/tournament-management/" + tournamentPathSegment(slug) + "/matches/" + encodeURIComponent(id),
    { headers: headers(token), cache: "no-store" });
}
