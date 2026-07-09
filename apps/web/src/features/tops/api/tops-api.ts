import { apiRequest } from "../../../lib/api/api-client";
import { getOrCreateVoterId } from "../../growth/lib/voter-id";
import type { TopListSort } from "../lib/top-list-sort";
import type {
  CreateTopCategoryInput,
  CreateTopInput,
  EntitySystemTopsResponse,
  EntityTopsResponse,
  ReplaceTopItemInput,
  SystemTopCatalogResponse,
  SystemTopDetail,
  Top,
  TopCategory,
  TopCategoryListResponse,
  TopComment,
  TopCommentListResponse,
  TopLikeResponse,
  TopListResponse,
  TopViewResponse,
  UpdateTopInput
} from "../types/tops";

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`
  };
}

export function fetchRecentTops(
  limit = 20,
  cursor?: string,
  sort: TopListSort = "recent"
): Promise<TopListResponse> {
  const params = new URLSearchParams({ limit: String(limit) });

  if (cursor) {
    params.set("cursor", cursor);
  }

  if (sort !== "recent") {
    params.set("sort", sort);
  }

  return apiRequest<TopListResponse>(`/tops?${params.toString()}`);
}

export function fetchTopBySlug(slug: string, accessToken?: string): Promise<Top> {
  return apiRequest<Top>(`/tops/${encodeURIComponent(slug)}`, {
    ...(accessToken ? { headers: authHeaders(accessToken) } : {})
  });
}

export function fetchEntityTops(entityId: string): Promise<EntityTopsResponse> {
  return apiRequest<EntityTopsResponse>(`/entities/${entityId}/tops`);
}

export function fetchEntitySystemTops(entityId: string): Promise<EntitySystemTopsResponse> {
  return apiRequest<EntitySystemTopsResponse>(`/entities/${entityId}/system-tops`);
}

export function fetchSystemTopsCatalog(): Promise<SystemTopCatalogResponse> {
  return apiRequest<SystemTopCatalogResponse>("/tops/system");
}

export function fetchSystemTopBySlug(slug: string): Promise<SystemTopDetail> {
  return apiRequest<SystemTopDetail>(`/tops/system/${encodeURIComponent(slug)}`);
}

export function fetchTopCategories(): Promise<TopCategoryListResponse> {
  return apiRequest<TopCategoryListResponse>("/tops/categories");
}

export function createTopCategory(
  input: CreateTopCategoryInput,
  accessToken: string
): Promise<TopCategory> {
  return apiRequest<TopCategory>("/tops/categories", {
    body: input,
    headers: authHeaders(accessToken),
    method: "POST"
  });
}

export function fetchTopsByCategory(
  slug: string,
  limit = 20,
  cursor?: string,
  sort: TopListSort = "recent"
): Promise<TopListResponse> {
  const params = new URLSearchParams({
    limit: String(limit)
  });

  if (cursor) {
    params.set("cursor", cursor);
  }

  if (sort !== "recent") {
    params.set("sort", sort);
  }

  return apiRequest<TopListResponse>(`/tops/category/${encodeURIComponent(slug)}?${params.toString()}`);
}

export function fetchTopsByAuthor(
  userId: string,
  limit = 20,
  cursor?: string
): Promise<TopListResponse> {
  const params = new URLSearchParams({ limit: String(limit) });

  if (cursor) {
    params.set("cursor", cursor);
  }

  return apiRequest<TopListResponse>(`/users/${userId}/tops?${params.toString()}`);
}

export function createTop(input: CreateTopInput, accessToken: string): Promise<Top> {
  return apiRequest<Top>("/tops", {
    body: input,
    headers: authHeaders(accessToken),
    method: "POST"
  });
}

export function updateTop(topId: string, input: UpdateTopInput, accessToken: string): Promise<Top> {
  return apiRequest<Top>(`/tops/${topId}`, {
    body: input,
    headers: authHeaders(accessToken),
    method: "PATCH"
  });
}

export function replaceTopItems(
  topId: string,
  items: ReplaceTopItemInput[],
  accessToken: string
): Promise<Top> {
  return apiRequest<Top>(`/tops/${topId}/items`, {
    body: { items },
    headers: authHeaders(accessToken),
    method: "PUT"
  });
}

export function deleteTop(topId: string, accessToken: string): Promise<Top> {
  return apiRequest<Top>(`/tops/${topId}`, {
    headers: authHeaders(accessToken),
    method: "DELETE"
  });
}

export function forkTop(topId: string, accessToken: string): Promise<Top> {
  return apiRequest<Top>(`/tops/${topId}/fork`, {
    headers: authHeaders(accessToken),
    method: "POST"
  });
}

export function fetchTopForks(
  topId: string,
  limit = 20,
  cursor?: string
): Promise<TopListResponse> {
  const params = new URLSearchParams({ limit: String(limit) });

  if (cursor) {
    params.set("cursor", cursor);
  }

  return apiRequest<TopListResponse>(`/tops/${topId}/forks?${params.toString()}`);
}

export function toggleTopLike(topId: string, accessToken: string): Promise<TopLikeResponse> {
  return apiRequest<TopLikeResponse>(`/tops/${topId}/like`, {
    headers: authHeaders(accessToken),
    method: "POST"
  });
}

export function recordTopView(topId: string, accessToken?: string): Promise<TopViewResponse> {
  return apiRequest<TopViewResponse>(`/tops/${topId}/view`, {
    headers: {
      "x-opinia-voter": getOrCreateVoterId(),
      ...(accessToken ? authHeaders(accessToken) : {})
    },
    method: "POST"
  });
}

export function fetchTopComments(
  topId: string,
  limit = 20,
  cursor?: string,
  accessToken?: string
): Promise<TopCommentListResponse> {
  const params = new URLSearchParams({ limit: String(limit) });

  if (cursor) {
    params.set("cursor", cursor);
  }

  return apiRequest<TopCommentListResponse>(`/tops/${topId}/comments?${params.toString()}`, {
    ...(accessToken ? { headers: authHeaders(accessToken) } : {})
  });
}

export function createTopComment(
  topId: string,
  text: string,
  accessToken: string
): Promise<TopComment> {
  return apiRequest<TopComment>(`/tops/${topId}/comments`, {
    body: { text },
    headers: authHeaders(accessToken),
    method: "POST"
  });
}
