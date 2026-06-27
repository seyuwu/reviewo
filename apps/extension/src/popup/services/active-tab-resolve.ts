import {
  createGetActiveTabResolveMessage,
  ExtensionMessageType,
  type ExtensionActiveTabResolveResultMessage
} from "../../shared/messages.js";
import type { ExtensionResolveResponse } from "../../shared/types/resolve.js";
import { sendExtensionMessage } from "./popup-messaging.js";

export interface ActiveTabResolveState {
  pageTitle?: string;
  result: ExtensionResolveResponse | null;
  url: string | null;
}

export async function fetchActiveTabResolve(): Promise<ActiveTabResolveState> {
  const response = await sendExtensionMessage<ExtensionActiveTabResolveResultMessage>(
    createGetActiveTabResolveMessage()
  );

  if (response?.type !== ExtensionMessageType.ActiveTabResolveResult) {
    return {
      result: null,
      url: null
    };
  }

  return {
    pageTitle: response.payload.pageTitle,
    result: response.payload.result,
    url: response.payload.url
  };
}
