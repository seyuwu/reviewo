import { extensionConfig } from "../../shared/config.js";

export type SearchResultKind = "canonical_site" | "entity";

export interface SearchEntityResult {
  avgScore: number | null;
  canonicalUrl: string | null;
  description: string | null;
  id: string;
  logoUrl?: string | null;
  resultKind: SearchResultKind;
  reviewsCount: number;
  slug: string;
  title: string;
  type: string;
  votesCount: number;
}

export interface SearchEntitiesResponse {
  canCreateEntity: boolean;
  query: string;
  results: SearchEntityResult[];
}

export async function searchEntities(query: string): Promise<SearchEntitiesResponse> {
  const endpoint = new URL("/search/entities", extensionConfig.apiBaseUrl);
  endpoint.searchParams.set("query", query.trim());

  const response = await fetch(endpoint.toString());

  if (!response.ok) {
    throw new Error(`Search failed with status ${response.status}`);
  }

  return (await response.json()) as SearchEntitiesResponse;
}
