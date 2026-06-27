import {
  createGetPageSourceTitleMessage,
  ExtensionMessageType
} from "../shared/messages.js";

export async function readPageSourceTitleFromTab(tabId: number): Promise<string | undefined> {
  try {
    const response = await chrome.tabs.sendMessage(tabId, createGetPageSourceTitleMessage());

    if (response?.type !== ExtensionMessageType.PageSourceTitleResult) {
      return undefined;
    }

    const title = response.payload?.title;

    return typeof title === "string" && title.trim() ? title : undefined;
  } catch {
    return undefined;
  }
}
