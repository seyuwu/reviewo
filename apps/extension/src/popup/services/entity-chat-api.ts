import { extensionConfig } from "../../shared/config.js";
import {
  ChatSendError,
  readRetryAfterSecondsFromApiBody
} from "../../shared/entity-chat/chat-send-error.js";

export interface EntityChatMessage {
  createdAt: string;
  displayName: string;
  entityId: string;
  id: string;
  message: string;
  userId: string;
}

export interface EntityChatMessagesPage {
  messages: EntityChatMessage[];
  nextCursor: string | null;
}

export interface EntityChatOnlineCount {
  entityId: string;
  onlineCount: number;
}

export interface ActiveNowItem {
  entityId: string;
  entitySlug: string;
  entityTitle: string;
  messageCount: number;
  onlineCount: number;
  participantCount: number;
  previewMessage: string | null;
  score: number;
}

export interface ActiveNowList {
  items: ActiveNowItem[];
}

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
  const response = await fetch(
    `${extensionConfig.apiBaseUrl}/chat/entities/${encodeURIComponent(entityId)}/messages${
      query ? `?${query}` : ""
    }`
  );

  if (!response.ok) {
    throw new Error(`Chat messages request failed with ${response.status}`);
  }

  return (await response.json()) as EntityChatMessagesPage;
}

export async function fetchEntityChatOnlineCount(entityId: string): Promise<EntityChatOnlineCount> {
  const response = await fetch(
    `${extensionConfig.apiBaseUrl}/chat/entities/${encodeURIComponent(entityId)}/online`
  );

  if (!response.ok) {
    throw new Error(`Chat online count request failed with ${response.status}`);
  }

  return (await response.json()) as EntityChatOnlineCount;
}

export async function fetchActiveNow(limit = 5): Promise<ActiveNowList> {
  const response = await fetch(`${extensionConfig.apiBaseUrl}/chat/active-now?limit=${limit}`);

  if (!response.ok) {
    throw new Error(`Active now request failed with ${response.status}`);
  }

  return (await response.json()) as ActiveNowList;
}

export async function pingEntityChatPresence(
  entityId: string,
  accessToken: string
): Promise<EntityChatOnlineCount> {
  const response = await fetch(
    `${extensionConfig.apiBaseUrl}/chat/entities/${encodeURIComponent(entityId)}/presence`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      method: "POST"
    }
  );

  if (!response.ok) {
    throw new Error(`Chat presence request failed with ${response.status}`);
  }

  return (await response.json()) as EntityChatOnlineCount;
}

export async function sendEntityChatMessage(
  entityId: string,
  message: string,
  accessToken: string
): Promise<EntityChatMessage> {
  const response = await fetch(
    `${extensionConfig.apiBaseUrl}/chat/entities/${encodeURIComponent(entityId)}/messages`,
    {
      body: JSON.stringify({ message }),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      method: "POST"
    }
  );

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const retryAfterSeconds = readRetryAfterSecondsFromApiBody(data);
    const errorMessage =
      data && typeof data === "object" && "error" in data
        ? ((data as { error?: { message?: string } }).error?.message ??
          `Chat send request failed with ${response.status}`)
        : `Chat send request failed with ${response.status}`;

    throw new ChatSendError(errorMessage, retryAfterSeconds);
  }

  return data as EntityChatMessage;
}
