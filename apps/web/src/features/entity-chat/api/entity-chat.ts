import { apiRequest } from "../../../lib/api/api-client";
import { ApiError } from "../../../lib/api/api-error";
import { ChatSendError, readRetryAfterSecondsFromApiBody } from "../lib/chat-send-error";
import type {
  EntityChatMessage,
  EntityChatMessagesPage,
  EntityChatOnlineCount
} from "../types/entity-chat";

export async function fetchEntityChatMessages(
  entityId: string,
  options?: { before?: string; limit?: number }
): Promise<EntityChatMessagesPage> {
  const params = new URLSearchParams();

  if (options?.before) {
    params.set("before", options.before);
  }

  if (options?.limit) {
    params.set("limit", String(options.limit));
  }

  const query = params.toString();

  return apiRequest<EntityChatMessagesPage>(
    `/chat/entities/${encodeURIComponent(entityId)}/messages${query ? `?${query}` : ""}`
  );
}

export function fetchEntityChatOnlineCount(entityId: string): Promise<EntityChatOnlineCount> {
  return apiRequest<EntityChatOnlineCount>(
    `/chat/entities/${encodeURIComponent(entityId)}/online`
  );
}

export function pingEntityChatPresence(
  entityId: string,
  accessToken: string
): Promise<EntityChatOnlineCount> {
  return apiRequest<EntityChatOnlineCount>(
    `/chat/entities/${encodeURIComponent(entityId)}/presence`,
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
  accessToken: string
): Promise<EntityChatMessage> {
  try {
    return await apiRequest<EntityChatMessage>(
      `/chat/entities/${encodeURIComponent(entityId)}/messages`,
      {
        body: { message },
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
