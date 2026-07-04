import { apiRequest } from "../../../lib/api/api-client";
import type { ActiveNowItem } from "../types/growth";

export interface ActiveNowResponse {
  items: ActiveNowItem[];
}

export function fetchActiveNow(limit = 8): Promise<ActiveNowResponse> {
  return apiRequest<ActiveNowResponse>(`/chat/active-now?limit=${limit}`);
}
