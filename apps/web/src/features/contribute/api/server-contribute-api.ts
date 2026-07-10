import { serverApiRequest } from "../../../lib/api/server-api-client";
import type { ContributeQueuesResponse } from "../types/contribute";

export async function fetchContributeQueuesServer(
  limit = 20
): Promise<ContributeQueuesResponse | null> {
  try {
    return await serverApiRequest<ContributeQueuesResponse>(`/contribute/queues?limit=${limit}`);
  } catch {
    return null;
  }
}
