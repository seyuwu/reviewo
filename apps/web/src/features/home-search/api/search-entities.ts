import { apiRequest } from "../../../lib/api/api-client";
import type { SearchEntitiesResponse } from "../types/search-entities";

export async function searchEntities(query: string): Promise<SearchEntitiesResponse> {
  const searchParams = new URLSearchParams({
    query
  });

  return apiRequest<SearchEntitiesResponse>(`/search/entities?${searchParams.toString()}`);
}
