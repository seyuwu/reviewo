import { apiRequest } from "../../../lib/api/api-client";
import type { CurrentUserProfile } from "../types/profile";

export function getCurrentUserProfile(accessToken: string): Promise<CurrentUserProfile> {
  return apiRequest<CurrentUserProfile>("/auth/me", {
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });
}
