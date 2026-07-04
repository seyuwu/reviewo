import { apiRequest } from "../../../lib/api/api-client";
import { ApiError } from "../../../lib/api/api-error";
import type { EntityChatLocale } from "@reviewo/shared";
import { ChatSendError, readRetryAfterSecondsFromApiBody } from "../lib/chat-send-error";
import { appendEntityChatLocaleParam } from "../lib/locale";
import type {
  EntityChatMessage,
  EntityChatMessagesPage,
  EntityChatOnlineCount
} from "../types/entity-chat";

export async function fetchEntityChatMessages(
  entityId: string,
  options?: { before?: string; limit?: number; locale?: EntityChatLocale }
): Promise<EntityChatMessagesPage> {
  const params = new URLSearchParams();

  if (options?.before) {
    params.set("before", options.before);
  }

  if (options?.limit) {
    params.set("limit", String(options.limit));
  }

  appendEntityChatLocaleParam(params, options?.locale ?? "ru");

  const query = params.toString();

  return apiRequest<EntityChatMessagesPage>(
    `/chat/entities/${encodeURIComponent(entityId)}/messages${query ? `?${query}` : ""}`
  );
}

export function fetchEntityChatOnlineCount(
  entityId: string,
  locale: EntityChatLocale = "ru"
): Promise<EntityChatOnlineCount> {
  const params = new URLSearchParams();
  appendEntityChatLocaleParam(params, locale);
  const query = params.toString();

  return apiRequest<EntityChatOnlineCount>(
    `/chat/entities/${encodeURIComponent(entityId)}/online${query ? `?${query}` : ""}`
  );
}

export function pingEntityChatPresence(
  entityId: string,
  accessToken: string,
  locale: EntityChatLocale = "ru"
): Promise<EntityChatOnlineCount> {
  const params = new URLSearchParams();
  appendEntityChatLocaleParam(params, locale);
  const query = params.toString();

  return apiRequest<EntityChatOnlineCount>(
    `/chat/entities/${encodeURIComponent(entityId)}/presence${query ? `?${query}` : ""}`,
    {
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      method: "POST"
    }
  );
}

export async function sendEntityChatMessage(
  entityId: string,
  message: string,
  accessToken: string,
  locale: EntityChatLocale = "ru"
): Promise<EntityChatMessage> {
  try {
    return await apiRequest<EntityChatMessage>(
      `/chat/entities/${encodeURIComponent(entityId)}/messages`,
      {
        body: { locale, message },
        headers: {
          authorization: `Bearer ${accessToken}`
        },
        method: "POST"
      }
    );
  } catch (error) {
    if (error instanceof ApiError) {
      const retryAfterSeconds = readRetryAfterSecondsFromApiBody(error.body);
      const errorMessage =
        error.body && typeof error.body === "object" && "error" in error.body
          ? ((error.body as { error?: { message?: string } }).error?.message ??
            "Chat send request failed")
          : "Chat send request failed";

      throw new ChatSendError(errorMessage, retryAfterSeconds);
    }

    throw error;
  }
}
