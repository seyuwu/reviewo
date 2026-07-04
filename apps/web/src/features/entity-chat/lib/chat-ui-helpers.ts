import type { TranslateFn } from "@reviewo/i18n";

import { ChatSendError } from "./chat-send-error";

export const CHAT_ONLINE_POLL_MS = 15_000;

export function formatChatOnlineCountLabel(t: TranslateFn, count: number): string {
  return t("chat.onlineCount", { count: String(count) });
}

export function formatChatSendErrorMessage(t: TranslateFn, error: unknown): string {
  if (error instanceof ChatSendError && error.retryAfterSeconds) {
    return t("chat.sendCooldown", { seconds: String(error.retryAfterSeconds) });
  }

  return t("chat.sendError");
}

export function isChatListNearBottom(list: HTMLElement, thresholdPx = 48): boolean {
  return list.scrollHeight - list.scrollTop - list.clientHeight <= thresholdPx;
}

export type ChatListScrollAnchor = {
  scrollHeight: number;
  scrollTop: number;
};

export function captureChatListScrollAnchor(list: HTMLElement): ChatListScrollAnchor {
  return {
    scrollHeight: list.scrollHeight,
    scrollTop: list.scrollTop
  };
}

export function preserveChatListScrollPosition(
  list: HTMLElement,
  anchor: ChatListScrollAnchor
): void {
  list.scrollTop = Math.max(0, anchor.scrollTop + (list.scrollHeight - anchor.scrollHeight));
}
