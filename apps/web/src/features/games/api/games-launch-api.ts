import { apiRequest } from "../../../lib/api/api-client";

export type GamesLaunchChannel =
  | "telegram"
  | "discord"
  | "newsletter"
  | "vk"
  | "email"
  | "other";
export type GamesLaunchSuggestionSource = "search" | "community";

export interface GamesLaunchStatus {
  averageMmr: string | null;
  communityOpen: boolean;
  devNoteLikeCount: number;
  devNoteLiked: boolean;
  launchAt: string;
  searchLive: boolean;
  waitingCount: number;
}

export function fetchGamesLaunchStatus(input?: {
  accessToken?: string | null;
  voterKey?: string | null;
}): Promise<GamesLaunchStatus> {
  const query = input?.voterKey ? `?voterKey=${encodeURIComponent(input.voterKey)}` : "";
  return apiRequest<GamesLaunchStatus>(`/games/launch/status${query}`, {
    ...(input?.accessToken
      ? { headers: { authorization: `Bearer ${input.accessToken}` } }
      : {})
  });
}

export function submitGamesLaunchInterest(
  input: { channel: GamesLaunchChannel; contact: string },
  accessToken?: string | null
): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>("/games/launch/interest", {
    body: input,
    method: "POST",
    ...(accessToken
      ? { headers: { authorization: `Bearer ${accessToken}` } }
      : {})
  });
}

export function submitGamesLaunchSuggestion(
  input: {
    body: string;
    contact?: string;
    source: GamesLaunchSuggestionSource;
  },
  accessToken?: string | null
): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>("/games/launch/suggestions", {
    body: input,
    method: "POST",
    ...(accessToken
      ? { headers: { authorization: `Bearer ${accessToken}` } }
      : {})
  });
}

export function toggleGamesLaunchDevNoteLike(
  voterKey: string | null | undefined,
  accessToken?: string | null
): Promise<{ likeCount: number; liked: boolean }> {
  return apiRequest<{ likeCount: number; liked: boolean }>("/games/launch/dev-note/like", {
    body: voterKey ? { voterKey } : {},
    method: "POST",
    ...(accessToken
      ? { headers: { authorization: `Bearer ${accessToken}` } }
      : {})
  });
}

export function fetchAdminGamesLaunchStatus(accessToken: string): Promise<GamesLaunchStatus> {
  return apiRequest<GamesLaunchStatus>("/admin/games/launch", {
    headers: { authorization: `Bearer ${accessToken}` }
  });
}

export function updateAdminGamesLaunch(
  input: { communityOpen?: boolean; searchLive?: boolean },
  accessToken: string
): Promise<GamesLaunchStatus> {
  return apiRequest<GamesLaunchStatus>("/admin/games/launch", {
    body: input,
    headers: { authorization: `Bearer ${accessToken}` },
    method: "PATCH"
  });
}
