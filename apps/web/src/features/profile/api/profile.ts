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
