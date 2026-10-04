import { apiRequest } from "../../../lib/api/api-client";

export interface AdminManagedUser {
  displayName: string;
  id: string;
  role: "ADMIN" | "TOURNAMENT_MODERATOR" | "USER";
  username: string | null;
}

export function searchAdminUsers(query: string, accessToken: string): Promise<AdminManagedUser[]> {
  const params = new URLSearchParams({ q: query });
  return apiRequest<AdminManagedUser[]>(`/admin/users/search?${params.toString()}`, {
    headers: { authorization: `Bearer ${accessToken}` }
  });
}

export function setAdminTournamentModerator(
  userId: string,
  enabled: boolean,
  accessToken: string
): Promise<AdminManagedUser> {
  return apiRequest<AdminManagedUser>(`/admin/users/${encodeURIComponent(userId)}/tournament-moderator`, {
    body: { enabled },
    headers: { authorization: `Bearer ${accessToken}` },
    method: "PATCH"
  });
}
