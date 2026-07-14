import { apiRequest } from "../../../lib/api/api-client";
import type { CreateDotaProfileInput, DotaProfile } from "../types/dota";
import type { DotaProfileSearchResponse } from "../types/dota-search";

export function createDotaProfile(
  input: CreateDotaProfileInput,
  accessToken: string
): Promise<DotaProfile> {
  return apiRequest<DotaProfile>("/dota/profiles", {
    body: input,
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    method: "POST"
  });
}

export function fetchMyDotaProfile(accessToken: string): Promise<DotaProfile> {
  return apiRequest<DotaProfile>("/dota/profiles/me", {
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });
}

export function updateMyDotaProfile(
  input: Partial<CreateDotaProfileInput>,
  accessToken: string
): Promise<DotaProfile> {
  return apiRequest<DotaProfile>("/dota/profiles/me", {
    body: input,
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    method: "PATCH"
  });
}

export function fetchDotaProfileBySlug(slug: string, accessToken?: string): Promise<DotaProfile> {
  return apiRequest<DotaProfile>(`/dota/profiles/${encodeURIComponent(slug)}`, {
    ...(accessToken
      ? {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      : {})
  });
}

export function fetchDotaProfileByAccountId(
  accountId: string,
  accessToken?: string
): Promise<DotaProfile> {
  return apiRequest<DotaProfile>(`/dota/profiles/by-id/${encodeURIComponent(accountId)}`, {
    ...(accessToken
      ? {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      : {})
  });
}

export function fetchDotaProfileByUsername(
  username: string,
  accessToken?: string
): Promise<DotaProfile> {
  return apiRequest<DotaProfile>(`/dota/profiles/by-username/${encodeURIComponent(username)}`, {
    ...(accessToken
      ? {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      : {})
  });
}

export function searchDotaProfiles(query: string): Promise<DotaProfileSearchResponse> {
  return apiRequest<DotaProfileSearchResponse>(
    `/dota/profiles/search?query=${encodeURIComponent(query)}`
  );
}

export function searchDotaProfile(query: string, accessToken?: string): Promise<DotaProfile> {
  const trimmed = query.trim();

  if (/^\d{8,10}$/.test(trimmed)) {
    return fetchDotaProfileByAccountId(trimmed, accessToken);
  }

  return fetchDotaProfileByUsername(trimmed, accessToken);
}

export function confirmDotaQualities(
  slug: string,
  qualityKeys: string[],
  visitorId: string,
  accessToken?: string
): Promise<DotaProfile> {
  return apiRequest<DotaProfile>(`/dota/profiles/${encodeURIComponent(slug)}/confirm`, {
    body: {
      qualityKeys,
      visitorId
    },
    ...(accessToken
      ? {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      : {}),
    method: "POST"
  });
}

export function revokeDotaQuality(
  slug: string,
  qualityKeys: string[],
  visitorId: string,
  accessToken?: string
): Promise<DotaProfile> {
  return apiRequest<DotaProfile>(`/dota/profiles/${encodeURIComponent(slug)}/confirm`, {
    body: {
      qualityKeys,
      visitorId
    },
    ...(accessToken
      ? {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      : {}),
    method: "DELETE"
  });
}
