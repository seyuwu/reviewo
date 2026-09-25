import { apiRequest } from "../../../lib/api/api-client";
import type { AuthResponse } from "../types/auth";

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
