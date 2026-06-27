import { createRequestShowRatingCardMessage } from "../../shared/messages.js";

export async function requestShowRatingCardOnActiveTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!tab?.id) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, createRequestShowRatingCardMessage());
  } catch {
    // Content script may be unavailable on unsupported pages.
  }
}
