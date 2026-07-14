export interface DotaProfileSearchHit {
  dotaAccountId: string;
  entityId: string;
  mmr: string | null;
  slug: string;
  title: string;
  username: string | null;
}

export interface DotaProfileSearchResponse {
  query: string;
  results: DotaProfileSearchHit[];
}
