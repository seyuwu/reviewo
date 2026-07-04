export type ChatMessageListDomConfig = {
  emptyClassName: string;
  itemClassName: string;
  listClassName: string;
  listDataAttribute: string;
  listSelector: string;
  messageIdAttribute: string;
};

export const POPUP_CHAT_MESSAGE_LIST_DOM: ChatMessageListDomConfig = {
  emptyClassName: "muted-copy chat-empty-copy",
  itemClassName: "chat-message-item",
  listClassName: "chat-message-list",
  listDataAttribute: "data-chat-message-list",
  listSelector: "[data-chat-message-list]",
  messageIdAttribute: "data-chat-message-id"
};

export const CARD_CHAT_MESSAGE_LIST_DOM: ChatMessageListDomConfig = {
  emptyClassName: "reviewo-meta",
  itemClassName: "reviewo-chat-message",
  listClassName: "reviewo-chat-message-list",
  listDataAttribute: "data-reviewo-chat-message-list",
  listSelector: "[data-reviewo-chat-message-list]",
  messageIdAttribute: "data-reviewo-chat-message-id"
};

export type ChatMessageListItem = {
  displayName: string;
  id: string;
  message: string;
};

export type ChatListScrollAnchor = {
  scrollHeight: number;
  scrollTop: number;
};

export function captureChatListScrollAnchor(list: HTMLElement): ChatListScrollAnchor {
  return {
    scrollHeight: list.scrollHeight,
    scrollTop: list.scrollTop
  };
}

export function preserveChatListScrollPosition(
  list: HTMLElement,
  anchor: ChatListScrollAnchor
): void {
  list.scrollTop = Math.max(0, anchor.scrollTop + (list.scrollHeight - anchor.scrollHeight));
}

export function scrollChatListToBottom(list: HTMLElement | null): void {
  if (!list) {
    return;
  }

  list.scrollTop = Math.max(0, list.scrollHeight - list.clientHeight);
}

export function renderChatMessageListItemHtml(
  message: ChatMessageListItem,
  config: ChatMessageListDomConfig,
  escapeHtml: (value: string) => string
): string {
  return `<li class="${config.itemClassName}" ${config.messageIdAttribute}="${escapeHtml(message.id)}">
    <strong>${escapeHtml(message.displayName)}:</strong>
    <span>${escapeHtml(message.message)}</span>
  </li>`;
}

export function readChatMessageListIds(
  list: HTMLElement,
  config: ChatMessageListDomConfig
): Set<string> {
  const ids = new Set<string>();

  list.querySelectorAll<HTMLElement>(`[${config.messageIdAttribute}]`).forEach((element) => {
    const id = element.getAttribute(config.messageIdAttribute);

    if (id) {
      ids.add(id);
    }
  });

  return ids;
}

export function replaceChatMessageList(
  body: HTMLElement,
  messages: ChatMessageListItem[],
  emptyText: string,
  config: ChatMessageListDomConfig,
  escapeHtml: (value: string) => string,
  preserveAnchor?: ChatListScrollAnchor | null
): HTMLElement | null {
  if (messages.length === 0) {
    body.innerHTML = `<p class="${config.emptyClassName}">${escapeHtml(emptyText)}</p>`;
    return null;
  }

  body.innerHTML = `<ul class="${config.listClassName}" ${config.listDataAttribute}>
    ${messages.map((message) => renderChatMessageListItemHtml(message, config, escapeHtml)).join("")}
  </ul>`;

  const list = body.querySelector<HTMLElement>(config.listSelector);

  if (list && preserveAnchor) {
    preserveChatListScrollPosition(list, preserveAnchor);
  }

  return list;
}

export function appendChatMessagesToList(
  list: HTMLElement,
  messages: ChatMessageListItem[],
  config: ChatMessageListDomConfig,
  escapeHtml: (value: string) => string
): void {
  const knownIds = readChatMessageListIds(list, config);
  const fragment = messages
    .filter((message) => !knownIds.has(message.id))
    .map((message) => renderChatMessageListItemHtml(message, config, escapeHtml))
    .join("");

  if (fragment) {
    list.insertAdjacentHTML("beforeend", fragment);
  }
}

export function prependChatMessagesToList(
  list: HTMLElement,
  messages: ChatMessageListItem[],
  config: ChatMessageListDomConfig,
  escapeHtml: (value: string) => string,
  anchor: ChatListScrollAnchor
): void {
  const knownIds = readChatMessageListIds(list, config);
  const fragment = messages
    .filter((message) => !knownIds.has(message.id))
    .map((message) => renderChatMessageListItemHtml(message, config, escapeHtml))
    .join("");

  if (!fragment) {
    return;
  }

  list.insertAdjacentHTML("afterbegin", fragment);
  preserveChatListScrollPosition(list, anchor);
}
