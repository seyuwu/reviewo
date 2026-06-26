export interface SearchEntityResult {
  canonicalUrl: string | null;
  description: string | null;
  id: string;
  slug: string;
  title: string;
  type: string;
}

export interface SearchEntitiesResponse {
  canCreateEntity: boolean;
  query: string;
  results: SearchEntityResult[];
}
