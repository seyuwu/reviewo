import type {
  EntityChatMessage,
  EntityChatMessagesPage,
  EntityChatOnlineCount
} from "../../popup/services/entity-chat-api.js";
import {
  appendEntityChatLocaleParam,
  type EntityChatLocale
} from "../../shared/entity-chat/locale.js";
import {
  createAuthenticatedApiRequestMessage,
  createPublicApiRequestMessage,
  ExtensionMessageType
} from "../../shared/messages.js";
import {
  ChatSendError,
  readRetryAfterSeconds
} from "../../shared/entity-chat/chat-send-error.js";
import { sendExtensionMessage } from "../extension-messaging.js";

async function readPublicData<T>(path: string): Promise<{ data?: T; errorMessage?: string }> {
  const response = await sendExtensionMessage(createPublicApiRequestMessage(path));

  if (response?.type === ExtensionMessageType.PublicApiResult) {
    return {
      data: response.payload?.data as T
    };
  }

  if (response?.type === ExtensionMessageType.PublicApiError) {
    return {
      errorMessage: response.payload?.message ?? "Request failed."
    };
  }

  return {
    errorMessage: "Request failed."
  };
}

async function readAuthenticatedData<T>(options: {
  body?: unknown;
  method?: "DELETE" | "GET" | "POST" | "PUT";
  path: string;
}): Promise<{ data?: T; errorDetails?: unknown; errorMessage?: string; status?: number }> {
  const response = await sendExtensionMessage(
    createAuthenticatedApiRequestMessage(
      options.path,
      options.method ?? "GET",
      options.body
    )
  );

  if (response?.type === ExtensionMessageType.AuthenticatedApiResult) {
    return {
      data: response.payload?.data as T
    };
  }

  if (response?.type === ExtensionMessageType.AuthenticatedApiError) {
    return {
      errorDetails: response.payload?.details,
      errorMessage: response.payload?.message ?? "Request failed.",
      status: response.payload?.status
    };
  }

  return {
    errorMessage: "Request failed."
  };
}

function buildMessagesPath(
  entityId: string,
  options: { before?: string; limit?: number; locale: EntityChatLocale }
): string {
  const params = new URLSearchParams();

  if (options.before) {
    params.set("before", options.before);
  }

  if (options.limit) {
    params.set("limit", String(options.limit));
  }

  appendEntityChatLocaleParam(params, options.locale);

  const query = params.toString();

  return `/chat/entities/${encodeURIComponent(entityId)}/messages${query ? `?${query}` : ""}`;
}

export async function fetchEntityChatMessages(
  entityId: string,
  options: { before?: string; limit?: number; locale: EntityChatLocale }
): Promise<EntityChatMessagesPage> {
  const result = await readPublicData<EntityChatMessagesPage>(buildMessagesPath(entityId, options));

  if (result.errorMessage) {
    throw new Error(result.errorMessage);
  }

  return result.data ?? { messages: [], nextCursor: null };
}

export async function fetchEntityChatOnlineCount(
  entityId: string,
  locale: EntityChatLocale
): Promise<EntityChatOnlineCount> {
  const params = new URLSearchParams();
  appendEntityChatLocaleParam(params, locale);
  const query = params.toString();

  const result = await readPublicData<EntityChatOnlineCount>(
    `/chat/entities/${encodeURIComponent(entityId)}/online${query ? `?${query}` : ""}`
  );

  if (result.errorMessage) {
    throw new Error(result.errorMessage);
  }

  return result.data ?? { entityId, onlineCount: 0 };
}

export async function pingEntityChatPresence(
  entityId: string,
  locale: EntityChatLocale
): Promise<EntityChatOnlineCount> {
  const params = new URLSearchParams();
  appendEntityChatLocaleParam(params, locale);
  const query = params.toString();

  const result = await readAuthenticatedData<EntityChatOnlineCount>({
    method: "POST",
    path: `/chat/entities/${encodeURIComponent(entityId)}/presence${query ? `?${query}` : ""}`
  });

  if (result.errorMessage) {
    throw new Error(result.errorMessage);
  }

  return result.data ?? { entityId, onlineCount: 0 };
}

export async function sendEntityChatMessage(
  entityId: string,
  message: string,
  _accessToken: string,
  locale: EntityChatLocale
): Promise<EntityChatMessage> {
  const result = await readAuthenticatedData<EntityChatMessage>({
    body: { locale, message },
    method: "POST",
    path: `/chat/entities/${encodeURIComponent(entityId)}/messages`
  });

  if (result.errorMessage) {
    const retryAfterSeconds = readRetryAfterSeconds(result.errorDetails);

    throw new ChatSendError(result.errorMessage, retryAfterSeconds);
  }

  if (!result.data) {
    throw new ChatSendError("Could not send chat message.");
  }

  return result.data;
}
