import { apiRequest } from "../../../lib/api/api-client";
import type { AuthResponse, CurrentUser } from "../types/auth";

export function recoverAccount(token: string): Promise<AuthResponse & {
  recoveryToken: string;
  recoveryUrl: string;
}> {
  return apiRequest("/auth/recover", {
    body: { token },
    method: "POST"
  });
}

export function claimEmail(
  input: { email: string; password: string },
  accessToken: string
): Promise<CurrentUser> {
  return apiRequest("/auth/claim-email", {
    body: input,
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    method: "POST"
  });
}
