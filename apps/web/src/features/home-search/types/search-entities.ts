export type SearchResultKind = "canonical_site" | "entity";

export interface SearchEntityResult {
  avgScore: number | null;
  canonicalUrl: string | null;
  description: string | null;
  id: string;
  logoUrl: string | null;
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
