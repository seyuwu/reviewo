import { apiRequest } from "../../../lib/api/api-client";
import { tournamentPathSegment } from "./dota-tournaments-api";
import type { MyTournamentRoom, TournamentRoom, TournamentRoomMessage, TournamentRoomMessages } from "../types/tournament-room";

const headers = (token: string) => ({ authorization: "Bearer " + token });
const path = (slug: string, entryId: string) =>
  "/dota/tournaments/" + tournamentPathSegment(slug) + "/entries/" + encodeURIComponent(entryId);

export function fetchTournamentRoom(slug: string, entryId: string, token?: string) {
  return apiRequest<TournamentRoom>(path(slug, entryId) + "/room",
    { cache: "no-store", ...(token ? { headers: headers(token) } : {}) });
}
export function fetchMyTournamentRooms(token: string) {
  return apiRequest<MyTournamentRoom[]>("/dota/tournaments/rooms/me", { headers: headers(token), cache: "no-store" });
}
export function fetchTournamentRoomMessages(slug: string, entryId: string, token: string, before?: string) {
  return apiRequest<TournamentRoomMessages>(path(slug, entryId) + "/messages" +
    (before ? "?before=" + encodeURIComponent(before) : ""), { headers: headers(token), cache: "no-store" });
}
export function sendTournamentRoomMessage(slug: string, entryId: string, token: string, message: string) {
  return apiRequest<TournamentRoomMessage>(path(slug, entryId) + "/messages",
    { headers: headers(token), method: "POST", body: { message } });
}
export function ensureTournamentRoomVoice(slug: string, entryId: string, token: string, intent: "create" | "join") {
  return apiRequest<{ channelId: string; guildId: string; inviteUrl: string; movedToVoice: boolean }>(
    path(slug, entryId) + "/discord-voice", { headers: headers(token), method: "POST", body: { intent } });
}
export function leaveTournamentAfterparty(slug: string, entryId: string, token: string) {
  return apiRequest<{ ok: true }>(path(slug, entryId) + "/room/members/me", { headers: headers(token), method: "DELETE" });
}
export function removeTournamentRoomMember(slug: string, entryId: string, userId: string, token: string) {
  return apiRequest<{ ok: true }>(path(slug, entryId) + "/members/" + encodeURIComponent(userId),
    { headers: headers(token), method: "DELETE" });
}
export function tournamentRoomUrl(slug: string, entryId: string) {
  return "/games/tournaments/" + tournamentPathSegment(slug) + "/teams/" + encodeURIComponent(entryId);
}
