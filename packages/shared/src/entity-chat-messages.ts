export const ENTITY_CHAT_CLIENT_INITIAL_LIMIT = 50;
export const ENTITY_CHAT_CLIENT_OLDER_LIMIT = 50;
export const ENTITY_CHAT_CLIENT_MAX_MESSAGES = 300;
export const ENTITY_CHAT_CARD_CACHE_MAX_ENTRIES = 30;

export interface EntityChatMessageLike {
  id: string;
}

export function trimEntityChatMessagesNewest<T>(
  messages: readonly T[],
  max = ENTITY_CHAT_CLIENT_MAX_MESSAGES
): T[] {
  if (messages.length <= max) {
    return [...messages];
  }

  return messages.slice(messages.length - max);
}

export function trimEntityChatMessagesOldest<T>(
  messages: readonly T[],
  max = ENTITY_CHAT_CLIENT_MAX_MESSAGES
): T[] {
  if (messages.length <= max) {
    return [...messages];
  }

  return messages.slice(0, max);
}

export function mergeEntityChatMessagesNewest<T extends EntityChatMessageLike>(
  current: readonly T[],
  incoming: readonly T[],
  max = ENTITY_CHAT_CLIENT_MAX_MESSAGES
): T[] {
  if (incoming.length === 0) {
    return trimEntityChatMessagesNewest(current, max);
  }

  if (current.length === 0) {
    return trimEntityChatMessagesNewest(incoming, max);
  }

  const knownIds = new Set(current.map((item) => item.id));
  const appended = incoming.filter((item) => !knownIds.has(item.id));

  if (appended.length === 0) {
    return trimEntityChatMessagesNewest(current, max);
  }

  return trimEntityChatMessagesNewest([...current, ...appended], max);
}

export function prependEntityChatMessagesOldest<T extends EntityChatMessageLike>(
  current: readonly T[],
  older: readonly T[],
  max = ENTITY_CHAT_CLIENT_MAX_MESSAGES
): T[] {
  if (older.length === 0) {
    return trimEntityChatMessagesNewest(current, max);
  }

  if (current.length === 0) {
    return trimEntityChatMessagesOldest(older, max);
  }

  const knownIds = new Set(current.map((item) => item.id));
  const prepended = older.filter((item) => !knownIds.has(item.id));

  if (prepended.length === 0) {
    return trimEntityChatMessagesNewest(current, max);
  }

  return trimEntityChatMessagesOldest([...prepended, ...current], max);
}

export function appendEntityChatMessageNewest<T extends EntityChatMessageLike>(
  current: readonly T[],
  message: T,
  max = ENTITY_CHAT_CLIENT_MAX_MESSAGES
): T[] {
  if (current.some((item) => item.id === message.id)) {
    return trimEntityChatMessagesNewest(current, max);
  }

  return trimEntityChatMessagesNewest([...current, message], max);
}

export function resolveEntityChatOlderCursor(
  messageCount: number,
  incomingNextCursor: string | null,
  currentNextCursor: string | null = null
): string | null {
  if (messageCount > ENTITY_CHAT_CLIENT_INITIAL_LIMIT) {
    return currentNextCursor ?? incomingNextCursor;
  }

  return incomingNextCursor;
}
