import { apiRequest } from "../../../lib/api/api-client";
import type { SearchEntityResult } from "../types/search-entities";

export interface TrustCheckResponse {
  entity: SearchEntityResult;
  mode: "created" | "existing";
  url: {
    canonical: string;
    input: string;
  };
}

export function checkUrlTrust(url: string): Promise<TrustCheckResponse> {
  return apiRequest<TrustCheckResponse>("/trust-check", {
    body: {
      url
    },
    method: "POST"
  });
}
