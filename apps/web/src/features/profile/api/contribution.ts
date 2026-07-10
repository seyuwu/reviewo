import { apiRequest } from "../../../lib/api/api-client";
import type { ContributionProfile } from "../../contribute/types/contribute";

export function getMyContributionProfile(accessToken: string): Promise<ContributionProfile> {
  return apiRequest<ContributionProfile>("/users/me/contribution", {
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });
}
