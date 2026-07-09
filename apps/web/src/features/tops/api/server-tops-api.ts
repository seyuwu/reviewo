import { serverApiRequest } from "../../../lib/api/server-api-client";
import { parseTopListSort, type TopListSort } from "../lib/top-list-sort";
import type { SystemTopCatalogResponse, SystemTopDetail, Top, TopCategoryListResponse, TopListResponse } from "../types/tops";

async function safeServerRequest<T>(path: string): Promise<T | null> {
  try {
    return await serverApiRequest<T>(path);
  } catch {
    return null;
  }
}

export function fetchRecentTopsServer(
  limit = 20,
  sort: TopListSort = "recent",
  searchQuery?: string
): Promise<TopListResponse | null> {
  const params = new URLSearchParams({ limit: String(limit) });

  if (sort !== "recent") {
    params.set("sort", sort);
  }

  const trimmedQuery = searchQuery?.trim();

  if (trimmedQuery) {
    params.set("q", trimmedQuery);
  }

  return safeServerRequest<TopListResponse>(`/tops?${params.toString()}`);
}

export function fetchTopBySlugServer(slug: string): Promise<Top | null> {
  return safeServerRequest<Top>(`/tops/${encodeURIComponent(slug)}`);
}

export function fetchSystemTopsCatalogServer(): Promise<SystemTopCatalogResponse | null> {
  return safeServerRequest<SystemTopCatalogResponse>("/tops/system");
}

export function fetchSystemTopBySlugServer(slug: string): Promise<SystemTopDetail | null> {
  return safeServerRequest<SystemTopDetail>(`/tops/system/${encodeURIComponent(slug)}`);
}

export function fetchTopCategoriesServer(): Promise<TopCategoryListResponse | null> {
  return safeServerRequest<TopCategoryListResponse>("/tops/categories");
}

export function fetchTopsByCategoryServer(
  slug: string,
  limit = 20,
  sort: TopListSort = "recent",
  searchQuery?: string
): Promise<TopListResponse | null> {
  const params = new URLSearchParams({ limit: String(limit) });

  if (sort !== "recent") {
    params.set("sort", sort);
  }

  const trimmedQuery = searchQuery?.trim();

  if (trimmedQuery) {
    params.set("q", trimmedQuery);
  }

  return safeServerRequest<TopListResponse>(
    `/tops/category/${encodeURIComponent(slug)}?${params.toString()}`
  );
}

export { parseTopListSort } from "../lib/top-list-sort";
