import type { ExtensionResolveResponse } from "./types/resolve.js";

export const ExtensionMessageType = {
  ActiveTabResolveResult: "ACTIVE_TAB_RESOLVE_RESULT",
  GetActiveTabResolve: "GET_ACTIVE_TAB_RESOLVE",
  PingFromContent: "PING_FROM_CONTENT",
  PingFromPopup: "PING_FROM_POPUP",
  PongFromBackground: "PONG_FROM_BACKGROUND",
  ResolvePageUrl: "RESOLVE_PAGE_URL",
  ResolvePageUrlError: "RESOLVE_PAGE_URL_ERROR",
  ResolvePageUrlResult: "RESOLVE_PAGE_URL_RESULT"
} as const;

export type ExtensionMessageSource = "content" | "popup";

export interface ExtensionPingMessage {
  payload: {
    sentAt: string;
    source: ExtensionMessageSource;
  };
  type: typeof ExtensionMessageType.PingFromContent | typeof ExtensionMessageType.PingFromPopup;
}

export interface ExtensionPongMessage {
  payload: {
    receivedFrom: ExtensionMessageSource;
    respondedAt: string;
  };
  type: typeof ExtensionMessageType.PongFromBackground;
}

export interface ExtensionResolvePageUrlMessage {
  payload: {
    url: string;
  };
  type: typeof ExtensionMessageType.ResolvePageUrl;
}

export interface ExtensionResolvePageUrlResultMessage {
  payload: {
    result: ExtensionResolveResponse;
    url: string;
  };
  type: typeof ExtensionMessageType.ResolvePageUrlResult;
}

export interface ExtensionResolvePageUrlErrorMessage {
  payload: {
    message: string;
    url: string;
  };
  type: typeof ExtensionMessageType.ResolvePageUrlError;
}

export interface ExtensionGetActiveTabResolveMessage {
  type: typeof ExtensionMessageType.GetActiveTabResolve;
}

export interface ExtensionActiveTabResolveResultMessage {
  payload: {
    result: ExtensionResolveResponse | null;
    url: string | null;
  };
  type: typeof ExtensionMessageType.ActiveTabResolveResult;
}

export type ExtensionMessage =
  | ExtensionActiveTabResolveResultMessage
  | ExtensionGetActiveTabResolveMessage
  | ExtensionPingMessage
  | ExtensionPongMessage
  | ExtensionResolvePageUrlErrorMessage
  | ExtensionResolvePageUrlMessage
  | ExtensionResolvePageUrlResultMessage;

export function createPingMessage(source: ExtensionMessageSource): ExtensionPingMessage {
  return {
    payload: {
      sentAt: new Date().toISOString(),
      source
    },
    type:
      source === "content"
        ? ExtensionMessageType.PingFromContent
        : ExtensionMessageType.PingFromPopup
  };
}

export function createPongMessage(receivedFrom: ExtensionMessageSource): ExtensionPongMessage {
  return {
    payload: {
      receivedFrom,
      respondedAt: new Date().toISOString()
    },
    type: ExtensionMessageType.PongFromBackground
  };
}

export function createResolvePageUrlMessage(url: string): ExtensionResolvePageUrlMessage {
  return {
    payload: {
      url
    },
    type: ExtensionMessageType.ResolvePageUrl
  };
}

export function createResolvePageUrlResultMessage(
  url: string,
  result: ExtensionResolveResponse
): ExtensionResolvePageUrlResultMessage {
  return {
    payload: {
      result,
      url
    },
    type: ExtensionMessageType.ResolvePageUrlResult
  };
}

export function createResolvePageUrlErrorMessage(
  url: string,
  message: string
): ExtensionResolvePageUrlErrorMessage {
  return {
    payload: {
      message,
      url
    },
    type: ExtensionMessageType.ResolvePageUrlError
  };
}

export function createGetActiveTabResolveMessage(): ExtensionGetActiveTabResolveMessage {
  return {
    type: ExtensionMessageType.GetActiveTabResolve
  };
}

export function createActiveTabResolveResultMessage(
  url: string | null,
  result: ExtensionResolveResponse | null
): ExtensionActiveTabResolveResultMessage {
  return {
    payload: {
      result,
      url
    },
    type: ExtensionMessageType.ActiveTabResolveResult
  };
}

export function isExtensionPingMessage(message: unknown): message is ExtensionPingMessage {
  if (!message || typeof message !== "object") {
    return false;
  }

  const candidate = message as ExtensionPingMessage;

  return (
    (candidate.type === ExtensionMessageType.PingFromContent ||
      candidate.type === ExtensionMessageType.PingFromPopup) &&
    candidate.payload?.source !== undefined &&
    typeof candidate.payload.sentAt === "string"
  );
}

export function isExtensionResolvePageUrlMessage(
  message: unknown
): message is ExtensionResolvePageUrlMessage {
  if (!message || typeof message !== "object") {
    return false;
  }

  const candidate = message as ExtensionResolvePageUrlMessage;

  return (
    candidate.type === ExtensionMessageType.ResolvePageUrl &&
    typeof candidate.payload?.url === "string"
  );
}

export function isExtensionGetActiveTabResolveMessage(
  message: unknown
): message is ExtensionGetActiveTabResolveMessage {
  if (!message || typeof message !== "object") {
    return false;
  }

  return (
    (message as ExtensionGetActiveTabResolveMessage).type ===
    ExtensionMessageType.GetActiveTabResolve
  );
}
