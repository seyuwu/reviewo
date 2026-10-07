import { apiRequest } from "../../../lib/api/api-client";
import type { DotaTournament } from "../types/dota-tournament";
import { tournamentPathSegment } from "./dota-tournaments-api";

export interface TournamentSeriesSettings {
  bestOf?: 1 | 3 | 5;
  scheduledAt?: string | null;
}
export interface TournamentMatchPlanInput extends TournamentSeriesSettings {
  bracketKind: "MAIN" | "LOWER" | "BRONZE" | "GRAND_FINAL";
  roundOffset: number;
  matchNumber: number;
}
const headers = (token: string) => ({ authorization: "Bearer " + token });
const path = (slug: string) => "/dota/tournament-management/" + tournamentPathSegment(slug) + "/bracket-plan";
export function fetchTournamentPlan(slug: string, token: string) {
  return apiRequest<DotaTournament>(path(slug), { headers: headers(token), cache: "no-store" });
}
export function saveTournamentPlan(slug: string, input: TournamentMatchPlanInput, token: string) {
  return apiRequest<DotaTournament>(path(slug), { headers: headers(token), method: "PATCH", body: input });
}
export function saveTournamentMatchSettings(matchId: string, input: TournamentSeriesSettings, token: string) {
  return apiRequest<unknown>("/dota/tournament-management/matches/" + encodeURIComponent(matchId) + "/settings",
    { headers: headers(token), method: "PATCH", body: input });
}
