const MAX_TOP_SEARCH_QUERY_LENGTH = 200;

export function normalizeTopSearchQuery(query?: string | null): string | undefined {
  if (typeof query !== "string") {
    return undefined;
  }

  const normalized = query.trim().slice(0, MAX_TOP_SEARCH_QUERY_LENGTH);

  return normalized.length > 0 ? normalized : undefined;
}
