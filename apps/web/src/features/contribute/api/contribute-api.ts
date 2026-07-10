import { apiRequest } from "../../../lib/api/api-client";
import type { ContributeQueuesResponse } from "../types/contribute";

export function fetchContributeQueues(
  limit = 20,
  accessToken?: string
): Promise<ContributeQueuesResponse> {
  return apiRequest<ContributeQueuesResponse>(`/contribute/queues?limit=${limit}`, {
    ...(accessToken
      ? {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
      : {})
  });
}
