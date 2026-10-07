import { apiRequest } from "../../../lib/api/api-client";
import type { AuthResponse } from "../types/auth";

export type TelegramOfficialRequest = {
  requestId: string;
  browserToken: string;
  nonce: string;
  clientId: number;
  expiresIn: number;
};

export function getTelegramOfficialConfiguration() {
  return apiRequest<{ enabled: boolean }>("/telegram/official-login/config", {
    cache: "no-store",
    signal: AbortSignal.timeout(5000)
  });
}

export function createTelegramOfficialRequest(accessToken?: string) {
  return apiRequest<TelegramOfficialRequest>(
    accessToken ? "/telegram/official-login/link/request" : "/telegram/official-login/request",
    {
      method: "POST",
      signal: AbortSignal.timeout(10000),
      ...(accessToken ? { headers: { authorization: `Bearer ${accessToken}` } } : {})
    }
  );
}

export function completeTelegramOfficialLogin(request: TelegramOfficialRequest, idToken: string) {
  return apiRequest<AuthResponse>("/telegram/official-login/complete", {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    body: { requestId: request.requestId, browserToken: request.browserToken, idToken }
  });
}

export function completeTelegramOfficialLink(
  request: TelegramOfficialRequest,
  idToken: string,
  accessToken: string
) {
  return apiRequest<{ linked: true }>("/telegram/official-login/link/complete", {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: { authorization: `Bearer ${accessToken}` },
    body: { requestId: request.requestId, browserToken: request.browserToken, idToken }
  });
}
