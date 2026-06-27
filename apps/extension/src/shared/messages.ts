import type { ExtensionStoredAuthSession } from "./types/auth.js";
import type { ExtensionQuickRatingResponse } from "./types/quick-rating.js";
import type { ExtensionResolveResponse } from "./types/resolve.js";

export const ExtensionMessageType = {
  ActiveTabResolveResult: "ACTIVE_TAB_RESOLVE_RESULT",
  AuthLogin: "AUTH_LOGIN",
  AuthOperationError: "AUTH_OPERATION_ERROR",
  AuthOperationSuccess: "AUTH_OPERATION_SUCCESS",
  AuthRegister: "AUTH_REGISTER",
  AuthSessionResult: "AUTH_SESSION_RESULT",
  AuthSignOut: "AUTH_SIGN_OUT",
  AuthenticatedApiError: "AUTHENTICATED_API_ERROR",
  AuthenticatedApiRequest: "AUTHENTICATED_API_REQUEST",
  AuthenticatedApiResult: "AUTHENTICATED_API_RESULT",
  EntityRatingUpdated: "ENTITY_RATING_UPDATED",
  GetActiveTabResolve: "GET_ACTIVE_TAB_RESOLVE",
  GetPageSourceTitle: "GET_PAGE_SOURCE_TITLE",
  GetAuthSession: "GET_AUTH_SESSION",
  PageSourceTitleResult: "PAGE_SOURCE_TITLE_RESULT",
  CheckRatingCardDismissed: "CHECK_RATING_CARD_DISMISSED",
  DismissRatingCard: "DISMISS_RATING_CARD",
  MarkEntityRatedOnTab: "MARK_ENTITY_RATED_ON_TAB",
  RatingCardDismissedResult: "RATING_CARD_DISMISSED_RESULT",
  RequestShowRatingCard: "REQUEST_SHOW_RATING_CARD",
  PingFromContent: "PING_FROM_CONTENT",
  PingFromPopup: "PING_FROM_POPUP",
  PublicApiError: "PUBLIC_API_ERROR",
  PublicApiRequest: "PUBLIC_API_REQUEST",
  PublicApiResult: "PUBLIC_API_RESULT",
  PongFromBackground: "PONG_FROM_BACKGROUND",
  ResolvePageUrl: "RESOLVE_PAGE_URL",
  ResolvePageUrlError: "RESOLVE_PAGE_URL_ERROR",
  ResolvePageUrlResult: "RESOLVE_PAGE_URL_RESULT",
  SyncWebAuth: "SYNC_WEB_AUTH"
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

export interface ExtensionGetPageSourceTitleMessage {
  type: typeof ExtensionMessageType.GetPageSourceTitle;
}

export interface ExtensionPageSourceTitleResultMessage {
  payload: {
    title?: string;
  };
  type: typeof ExtensionMessageType.PageSourceTitleResult;
}

export interface ExtensionActiveTabResolveResultMessage {
  payload: {
    pageTitle?: string;
    result: ExtensionResolveResponse | null;
    url: string | null;
  };
  type: typeof ExtensionMessageType.ActiveTabResolveResult;
}

export interface ExtensionGetAuthSessionMessage {
  type: typeof ExtensionMessageType.GetAuthSession;
}

export interface ExtensionCheckRatingCardDismissedMessage {
  payload: {
    canonicalUrl: string;
    siteHostname: string;
  };
  type: typeof ExtensionMessageType.CheckRatingCardDismissed;
}

export interface ExtensionRatingCardDismissedResultMessage {
  payload: {
    dismissed: boolean;
  };
  type: typeof ExtensionMessageType.RatingCardDismissedResult;
}

export interface ExtensionDismissRatingCardMessage {
  payload: {
    canonicalUrl: string;
  };
  type: typeof ExtensionMessageType.DismissRatingCard;
}

export interface ExtensionMarkEntityRatedOnTabMessage {
  payload: {
    canonicalUrl: string;
  };
  type: typeof ExtensionMessageType.MarkEntityRatedOnTab;
}

export interface ExtensionRequestShowRatingCardMessage {
  type: typeof ExtensionMessageType.RequestShowRatingCard;
}

export interface ExtensionEntityRatingUpdatedMessage {
  payload: {
    canonicalUrl: string;
    entityId: string;
    quickRating?: ExtensionQuickRatingResponse;
    score: number;
  };
  type: typeof ExtensionMessageType.EntityRatingUpdated;
}

export interface ExtensionAuthSessionResultMessage {
  payload: {
    session: ExtensionStoredAuthSession | null;
  };
  type: typeof ExtensionMessageType.AuthSessionResult;
}

export interface ExtensionAuthLoginMessage {
  payload: {
    email: string;
    password: string;
  };
  type: typeof ExtensionMessageType.AuthLogin;
}

export interface ExtensionAuthRegisterMessage {
  payload: {
    displayName: string;
    email: string;
    password: string;
  };
  type: typeof ExtensionMessageType.AuthRegister;
}

export interface ExtensionAuthSignOutMessage {
  type: typeof ExtensionMessageType.AuthSignOut;
}

export interface ExtensionSyncWebAuthMessage {
  payload: {
    rawAuthJson: string;
  };
  type: typeof ExtensionMessageType.SyncWebAuth;
}

export interface ExtensionAuthOperationSuccessMessage {
  payload: {
    session: ExtensionStoredAuthSession;
  };
  type: typeof ExtensionMessageType.AuthOperationSuccess;
}

export interface ExtensionAuthOperationErrorMessage {
  payload: {
    message: string;
  };
  type: typeof ExtensionMessageType.AuthOperationError;
}

export interface ExtensionAuthenticatedApiRequestMessage {
  payload: {
    body?: unknown;
    method?: "DELETE" | "GET" | "POST" | "PUT";
    path: string;
  };
  type: typeof ExtensionMessageType.AuthenticatedApiRequest;
}

export interface ExtensionAuthenticatedApiResultMessage {
  payload: {
    data: unknown;
    status: number;
  };
  type: typeof ExtensionMessageType.AuthenticatedApiResult;
}

export interface ExtensionAuthenticatedApiErrorMessage {
  payload: {
    message: string;
  };
  type: typeof ExtensionMessageType.AuthenticatedApiError;
}

export interface ExtensionPublicApiRequestMessage {
  payload: {
    path: string;
  };
  type: typeof ExtensionMessageType.PublicApiRequest;
}

export interface ExtensionPublicApiResultMessage {
  payload: {
    data: unknown;
    status: number;
  };
  type: typeof ExtensionMessageType.PublicApiResult;
}

export interface ExtensionPublicApiErrorMessage {
  payload: {
    message: string;
  };
  type: typeof ExtensionMessageType.PublicApiError;
}

export type ExtensionMessage =
  | ExtensionActiveTabResolveResultMessage
  | ExtensionAuthLoginMessage
  | ExtensionAuthOperationErrorMessage
  | ExtensionAuthOperationSuccessMessage
  | ExtensionAuthRegisterMessage
  | ExtensionAuthSessionResultMessage
  | ExtensionAuthSignOutMessage
  | ExtensionAuthenticatedApiErrorMessage
  | ExtensionAuthenticatedApiRequestMessage
  | ExtensionAuthenticatedApiResultMessage
  | ExtensionGetActiveTabResolveMessage
  | ExtensionGetPageSourceTitleMessage
  | ExtensionGetAuthSessionMessage
  | ExtensionPageSourceTitleResultMessage
  | ExtensionCheckRatingCardDismissedMessage
  | ExtensionDismissRatingCardMessage
  | ExtensionEntityRatingUpdatedMessage
  | ExtensionMarkEntityRatedOnTabMessage
  | ExtensionRequestShowRatingCardMessage
  | ExtensionRatingCardDismissedResultMessage
  | ExtensionPingMessage
  | ExtensionPublicApiErrorMessage
  | ExtensionPublicApiRequestMessage
  | ExtensionPublicApiResultMessage
  | ExtensionPongMessage
  | ExtensionResolvePageUrlErrorMessage
  | ExtensionResolvePageUrlMessage
  | ExtensionResolvePageUrlResultMessage
  | ExtensionSyncWebAuthMessage;

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

export function createGetPageSourceTitleMessage(): ExtensionGetPageSourceTitleMessage {
  return {
    type: ExtensionMessageType.GetPageSourceTitle
  };
}

export function createPageSourceTitleResultMessage(
  title?: string
): ExtensionPageSourceTitleResultMessage {
  return {
    payload: title === undefined ? {} : { title },
    type: ExtensionMessageType.PageSourceTitleResult
  };
}

export function createActiveTabResolveResultMessage(
  url: string | null,
  result: ExtensionResolveResponse | null,
  pageTitle?: string
): ExtensionActiveTabResolveResultMessage {
  return {
    payload: {
      ...(pageTitle === undefined ? {} : { pageTitle }),
      result,
      url
    },
    type: ExtensionMessageType.ActiveTabResolveResult
  };
}

export function createGetAuthSessionMessage(): ExtensionGetAuthSessionMessage {
  return {
    type: ExtensionMessageType.GetAuthSession
  };
}

export function createCheckRatingCardDismissedMessage(
  canonicalUrl: string,
  siteHostname: string
): ExtensionCheckRatingCardDismissedMessage {
  return {
    payload: {
      canonicalUrl,
      siteHostname
    },
    type: ExtensionMessageType.CheckRatingCardDismissed
  };
}

export function createDismissRatingCardMessage(
  canonicalUrl: string
): ExtensionDismissRatingCardMessage {
  return {
    payload: {
      canonicalUrl
    },
    type: ExtensionMessageType.DismissRatingCard
  };
}

export function createMarkEntityRatedOnTabMessage(
  canonicalUrl: string
): ExtensionMarkEntityRatedOnTabMessage {
  return {
    payload: {
      canonicalUrl
    },
    type: ExtensionMessageType.MarkEntityRatedOnTab
  };
}

export function createRequestShowRatingCardMessage(): ExtensionRequestShowRatingCardMessage {
  return {
    type: ExtensionMessageType.RequestShowRatingCard
  };
}

export function createEntityRatingUpdatedMessage(
  payload: ExtensionEntityRatingUpdatedMessage["payload"]
): ExtensionEntityRatingUpdatedMessage {
  return {
    payload,
    type: ExtensionMessageType.EntityRatingUpdated
  };
}

export function createRatingCardDismissedResultMessage(
  dismissed: boolean
): ExtensionRatingCardDismissedResultMessage {
  return {
    payload: {
      dismissed
    },
    type: ExtensionMessageType.RatingCardDismissedResult
  };
}

export function createAuthSessionResultMessage(
  session: ExtensionStoredAuthSession | null
): ExtensionAuthSessionResultMessage {
  return {
    payload: {
      session
    },
    type: ExtensionMessageType.AuthSessionResult
  };
}

export function createAuthLoginMessage(email: string, password: string): ExtensionAuthLoginMessage {
  return {
    payload: {
      email,
      password
    },
    type: ExtensionMessageType.AuthLogin
  };
}

export function createAuthRegisterMessage(
  displayName: string,
  email: string,
  password: string
): ExtensionAuthRegisterMessage {
  return {
    payload: {
      displayName,
      email,
      password
    },
    type: ExtensionMessageType.AuthRegister
  };
}

export function createAuthSignOutMessage(): ExtensionAuthSignOutMessage {
  return {
    type: ExtensionMessageType.AuthSignOut
  };
}

export function createSyncWebAuthMessage(rawAuthJson: string): ExtensionSyncWebAuthMessage {
  return {
    payload: {
      rawAuthJson
    },
    type: ExtensionMessageType.SyncWebAuth
  };
}

export function createAuthOperationSuccessMessage(
  session: ExtensionStoredAuthSession
): ExtensionAuthOperationSuccessMessage {
  return {
    payload: {
      session
    },
    type: ExtensionMessageType.AuthOperationSuccess
  };
}

export function createAuthOperationErrorMessage(
  message: string
): ExtensionAuthOperationErrorMessage {
  return {
    payload: {
      message
    },
    type: ExtensionMessageType.AuthOperationError
  };
}

export function createAuthenticatedApiRequestMessage(
  path: string,
  method: "DELETE" | "GET" | "POST" | "PUT" = "GET",
  body?: unknown
): ExtensionAuthenticatedApiRequestMessage {
  return {
    payload: {
      body,
      method,
      path
    },
    type: ExtensionMessageType.AuthenticatedApiRequest
  };
}

export function createAuthenticatedApiResultMessage(
  data: unknown,
  status: number
): ExtensionAuthenticatedApiResultMessage {
  return {
    payload: {
      data,
      status
    },
    type: ExtensionMessageType.AuthenticatedApiResult
  };
}

export function createAuthenticatedApiErrorMessage(
  message: string
): ExtensionAuthenticatedApiErrorMessage {
  return {
    payload: {
      message
    },
    type: ExtensionMessageType.AuthenticatedApiError
  };
}

export function createPublicApiRequestMessage(path: string): ExtensionPublicApiRequestMessage {
  return {
    payload: {
      path
    },
    type: ExtensionMessageType.PublicApiRequest
  };
}

export function createPublicApiResultMessage(
  data: unknown,
  status: number
): ExtensionPublicApiResultMessage {
  return {
    payload: {
      data,
      status
    },
    type: ExtensionMessageType.PublicApiResult
  };
}

export function createPublicApiErrorMessage(message: string): ExtensionPublicApiErrorMessage {
  return {
    payload: {
      message
    },
    type: ExtensionMessageType.PublicApiError
  };
}

export function isExtensionPublicApiRequestMessage(
  message: unknown
): message is ExtensionPublicApiRequestMessage {
  if (!message || typeof message !== "object") {
    return false;
  }

  const candidate = message as ExtensionPublicApiRequestMessage;

  return (
    candidate.type === ExtensionMessageType.PublicApiRequest &&
    typeof candidate.payload?.path === "string"
  );
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

export function isExtensionGetPageSourceTitleMessage(
  message: unknown
): message is ExtensionGetPageSourceTitleMessage {
  if (!message || typeof message !== "object") {
    return false;
  }

  return (
    (message as ExtensionGetPageSourceTitleMessage).type ===
    ExtensionMessageType.GetPageSourceTitle
  );
}

export function isExtensionGetAuthSessionMessage(
  message: unknown
): message is ExtensionGetAuthSessionMessage {
  if (!message || typeof message !== "object") {
    return false;
  }

  return (message as ExtensionGetAuthSessionMessage).type === ExtensionMessageType.GetAuthSession;
}

export function isExtensionCheckRatingCardDismissedMessage(
  message: unknown
): message is ExtensionCheckRatingCardDismissedMessage {
  if (!message || typeof message !== "object") {
    return false;
  }

  const candidate = message as ExtensionCheckRatingCardDismissedMessage;

  return (
    candidate.type === ExtensionMessageType.CheckRatingCardDismissed &&
    typeof candidate.payload?.canonicalUrl === "string" &&
    typeof candidate.payload?.siteHostname === "string"
  );
}

export function isExtensionDismissRatingCardMessage(
  message: unknown
): message is ExtensionDismissRatingCardMessage {
  if (!message || typeof message !== "object") {
    return false;
  }

  const candidate = message as ExtensionDismissRatingCardMessage;

  return (
    candidate.type === ExtensionMessageType.DismissRatingCard &&
    typeof candidate.payload?.canonicalUrl === "string"
  );
}

export function isExtensionMarkEntityRatedOnTabMessage(
  message: unknown
): message is ExtensionMarkEntityRatedOnTabMessage {
  if (!message || typeof message !== "object") {
    return false;
  }

  const candidate = message as ExtensionMarkEntityRatedOnTabMessage;

  return (
    candidate.type === ExtensionMessageType.MarkEntityRatedOnTab &&
    typeof candidate.payload?.canonicalUrl === "string"
  );
}

export function isExtensionRequestShowRatingCardMessage(
  message: unknown
): message is ExtensionRequestShowRatingCardMessage {
  if (!message || typeof message !== "object") {
    return false;
  }

  return (message as ExtensionRequestShowRatingCardMessage).type ===
    ExtensionMessageType.RequestShowRatingCard;
}

export function isExtensionEntityRatingUpdatedMessage(
  message: unknown
): message is ExtensionEntityRatingUpdatedMessage {
  if (!message || typeof message !== "object") {
    return false;
  }

  const candidate = message as ExtensionEntityRatingUpdatedMessage;

  return (
    candidate.type === ExtensionMessageType.EntityRatingUpdated &&
    typeof candidate.payload?.canonicalUrl === "string" &&
    typeof candidate.payload?.entityId === "string" &&
    typeof candidate.payload?.score === "number"
  );
}

export function isExtensionAuthLoginMessage(
  message: unknown
): message is ExtensionAuthLoginMessage {
  if (!message || typeof message !== "object") {
    return false;
  }

  const candidate = message as ExtensionAuthLoginMessage;

  return (
    candidate.type === ExtensionMessageType.AuthLogin &&
    typeof candidate.payload?.email === "string" &&
    typeof candidate.payload?.password === "string"
  );
}

export function isExtensionAuthRegisterMessage(
  message: unknown
): message is ExtensionAuthRegisterMessage {
  if (!message || typeof message !== "object") {
    return false;
  }

  const candidate = message as ExtensionAuthRegisterMessage;

  return (
    candidate.type === ExtensionMessageType.AuthRegister &&
    typeof candidate.payload?.displayName === "string" &&
    typeof candidate.payload?.email === "string" &&
    typeof candidate.payload?.password === "string"
  );
}

export function isExtensionAuthSignOutMessage(
  message: unknown
): message is ExtensionAuthSignOutMessage {
  if (!message || typeof message !== "object") {
    return false;
  }

  return (message as ExtensionAuthSignOutMessage).type === ExtensionMessageType.AuthSignOut;
}

export function isExtensionSyncWebAuthMessage(
  message: unknown
): message is ExtensionSyncWebAuthMessage {
  if (!message || typeof message !== "object") {
    return false;
  }

  const candidate = message as ExtensionSyncWebAuthMessage;

  return (
    candidate.type === ExtensionMessageType.SyncWebAuth &&
    typeof candidate.payload?.rawAuthJson === "string"
  );
}

export function isExtensionAuthenticatedApiRequestMessage(
  message: unknown
): message is ExtensionAuthenticatedApiRequestMessage {
  if (!message || typeof message !== "object") {
    return false;
  }

  const candidate = message as ExtensionAuthenticatedApiRequestMessage;

  return (
    candidate.type === ExtensionMessageType.AuthenticatedApiRequest &&
    typeof candidate.payload?.path === "string"
  );
}
