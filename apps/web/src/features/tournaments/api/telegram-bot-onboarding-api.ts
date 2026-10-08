import { apiRequest } from "../../../lib/api/api-client";

export type TelegramTournamentBotStatus = {
  botStarted: boolean;
  telegramLinked: boolean;
  canAccessTournamentsWithoutTelegram: boolean;
};

export type TelegramTournamentBotLinkRequest =
  | { botStarted: true }
  | {
      botStarted: false;
      botUrl: string;
      expiresIn: number;
      requestId: string;
    };

export type TelegramTournamentBotLinkPoll =
  | { status: "pending" }
  | { status: "approved" }
  | { status: "conflict" }
  | { status: "expired" };

function authHeaders(accessToken: string) {
  return { authorization: `Bearer ${accessToken}` };
}

export function getTelegramTournamentBotStatus(accessToken: string) {
  return apiRequest<TelegramTournamentBotStatus>("/telegram/tournament-bot-link/status", {
    headers: authHeaders(accessToken),
    cache: "no-store"
  });
}

export function createTelegramTournamentBotLink(accessToken: string, forceConfirmation = false) {
  return apiRequest<TelegramTournamentBotLinkRequest>("/telegram/tournament-bot-link", {
    headers: authHeaders(accessToken),
    method: "POST",
    body: { forceConfirmation }
  });
}

export function pollTelegramTournamentBotLink(accessToken: string, requestId: string, requireConfirmation = false) {
  return apiRequest<TelegramTournamentBotLinkPoll>("/telegram/tournament-bot-link/poll", {
    body: { requestId, requireConfirmation },
    headers: authHeaders(accessToken),
    method: "POST"
  });
}
