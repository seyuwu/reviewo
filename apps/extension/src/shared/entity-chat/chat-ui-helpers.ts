import type { TranslateFn } from "@reviewo/i18n";

import { ChatSendError } from "./chat-send-error.js";

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

export function updateChatOnlineCountElement(
  container: ParentNode,
  t: TranslateFn,
  count: number
): void {
  const label = container.querySelector<HTMLElement>(
    "[data-reviewo-chat-online-count], [data-chat-online-count]"
  );

  if (label) {
    label.textContent = formatChatOnlineCountLabel(t, count);
  }
}
