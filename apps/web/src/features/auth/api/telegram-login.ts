import { apiRequest } from "../../../lib/api/api-client";
import type { AuthResponse } from "../types/auth";

export type TelegramBrowserLoginStart = {
  botUrl: string;
  expiresIn: number;
  pollToken: string;
  requestId: string;
};

export type TelegramBrowserLoginPoll =
  | { status: "pending" }
  | { status: "expired" }
  | { auth: AuthResponse; status: "approved" };

export function createTelegramBrowserLogin(): Promise<TelegramBrowserLoginStart> {
  return apiRequest<TelegramBrowserLoginStart>("/telegram/browser-login", { method: "POST" });
}

export function pollTelegramBrowserLogin(
  requestId: string,
  pollToken: string
): Promise<TelegramBrowserLoginPoll> {
  return apiRequest<TelegramBrowserLoginPoll>("/telegram/browser-login/poll", {
    body: { pollToken, requestId },
    method: "POST"
  });
}

export type TelegramLoginPayload = {
  auth_date: string;
  first_name: string;
  hash: string;
  id: string;
  last_name?: string;
  photo_url?: string;
  username?: string;
};

export function loginWithTelegram(payload: TelegramLoginPayload): Promise<AuthResponse> {
  return apiRequest<AuthResponse>("/telegram/login", {
    body: payload,
    method: "POST"
  });
}

export function exchangeTelegramWebAccessTicket(ticket: string): Promise<AuthResponse> {
  return apiRequest<AuthResponse>("/telegram/web-access-ticket/exchange", {
    body: { ticket },
    method: "POST"
  });
}
