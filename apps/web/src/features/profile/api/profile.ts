import { apiRequest } from "../../../lib/api/api-client";
import type {
  ChangePasswordInput,
  CurrentUserProfile,
  UpdateCurrentUserProfileInput
} from "../types/profile";

export function getCurrentUserProfile(accessToken: string): Promise<CurrentUserProfile> {
  return apiRequest<CurrentUserProfile>("/auth/me", {
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });
}

export function updateCurrentUserProfile(
  input: UpdateCurrentUserProfileInput,
  accessToken: string
): Promise<CurrentUserProfile> {
  return apiRequest<CurrentUserProfile>("/auth/me", {
    body: input,
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    method: "PATCH"
  });
}

export function changeCurrentUserPassword(
  input: ChangePasswordInput,
  accessToken: string
): Promise<null> {
  return apiRequest<null>("/auth/change-password", {
    body: input,
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    method: "POST"
  });
}

export function updateCurrentUserAvatar(
  imageDataUrl: string,
  accessToken: string
): Promise<CurrentUserProfile> {
  return apiRequest<CurrentUserProfile>("/auth/me/avatar", {
    body: { imageDataUrl },
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    method: "POST"
  });
}

export function getDiscordLinkUrl(
  accessToken: string,
  returnTo: string,
  returnOrigin: string = typeof window !== "undefined" ? window.location.origin : ""
): Promise<{ url: string }> {
  const params = new URLSearchParams({
    returnOrigin,
    returnTo
  });
  return apiRequest<{ url: string }>(`/auth/discord/link?${params.toString()}`, {
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });
}

export function unlinkDiscord(accessToken: string): Promise<CurrentUserProfile> {
  return apiRequest<CurrentUserProfile>("/auth/discord", {
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    method: "DELETE"
  });
}
