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

export interface GuestDotaProfileCreateResponse {
  accessToken: string;
  expiresIn: number;
  tokenType: "Bearer";
  user: {
    avatarUrl?: string | null;
    displayName: string;
    email: string | null;
    id: string;
  };
  profile: DotaProfile;
  recoveryToken: string;
  recoveryUrl: string;
}

export function createGuestDotaProfile(
  input: CreateDotaProfileInput
): Promise<GuestDotaProfileCreateResponse> {
  return apiRequest<GuestDotaProfileCreateResponse>("/dota/profiles/guest", {
    body: input,
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

export interface DotaLfgFlag {
  count: number;
  key: string;
}

export interface DotaLfgHit {
  claimedRoles?: string[];
  desiredSize: number | null;
  greenFlags: DotaLfgFlag[];
  joinMode?: "OPEN" | "CONFIRM";
  memberCount: number | null;
  mmr: string | null;
  ownerUserId: string;
  partyKind: "TEAM" | "PARTY" | null;
  partyName: string | null;
  partySlug: string | null;
  recruitedRoles: string[];
  redFlags: DotaLfgFlag[];
  roles: string[];
  server: string | null;
  slug: string;
  title: string;
}

export interface DotaLfgListResponse {
  results: DotaLfgHit[];
}

export function fetchDotaLfg(input?: {
  accessToken?: string;
  roles?: string[];
  server?: string;
}): Promise<DotaLfgListResponse> {
  const params = new URLSearchParams();

  if (input?.server) {
    params.set("server", input.server);
  }

  if (input?.roles && input.roles.length > 0) {
    params.set("roles", input.roles.join(","));
  }

  const query = params.toString();

  return apiRequest<DotaLfgListResponse>(`/dota/profiles/lfg${query ? `?${query}` : ""}`, {
    ...(input?.accessToken
      ? {
          headers: {
            authorization: `Bearer ${input.accessToken}`
          }
        }
      : {})
  });
}

export function setDotaLfgLooking(
  looking: boolean,
  accessToken: string,
  options?: { partySlug?: string; recruitedRoles?: string[] }
): Promise<DotaProfile> {
  return apiRequest<DotaProfile>("/dota/profiles/lfg/looking", {
    body: {
      looking,
      ...(options?.recruitedRoles !== undefined ? { recruitedRoles: options.recruitedRoles } : {}),
      ...(options?.partySlug ? { partySlug: options.partySlug } : {})
    },
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    method: "POST"
  });
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
