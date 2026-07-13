import { apiRequest } from "../../../lib/api/api-client";
import type { CreateDotaProfileInput, DotaProfile } from "../types/dota";

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
