import { apiRequest } from "../../../lib/api/api-client";
import type { UserTrustProfile } from "../types/trust";

export function getUserTrustProfile(userId: string, accessToken: string): Promise<UserTrustProfile> {
  return apiRequest<UserTrustProfile>(`/reputation/users/${userId}`, {
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });
}
