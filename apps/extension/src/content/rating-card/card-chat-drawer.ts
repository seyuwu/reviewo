import type { TranslateFn } from "@reviewo/i18n";

import type { EntityChatMessage } from "../../popup/services/entity-chat-api.js";
import { connectEntityChatSocket } from "../../popup/services/entity-chat-socket.js";
import { resumeAutoDismiss, suspendAutoDismiss, type AutoDismissHost } from "./auto-dismiss.js";
import { getExtensionSessionAccessToken } from "./auth-session-state.js";
import {
  fetchEntityChatMessages,
  fetchEntityChatOnlineCount,
  pingEntityChatPresence,
  sendEntityChatMessage
} from "./fetch-entity-chat.js";
import {
  CHAT_ONLINE_POLL_MS,
  formatChatOnlineCountLabel,
  formatChatSendErrorMessage,
  updateChatOnlineCountElement
} from "../../shared/entity-chat/chat-ui-helpers.js";

export interface CardChatDrawerActions {
  onRequestSignIn: () => void;
}

export interface CardChatDrawerOptions {
  accessToken: string | null;
  entityId: string;
  entityTitle: string;
  isAuthenticated: boolean;
}

const expandedStateByEntity = new Map<string, boolean>();
const CHAT_MESSAGE_SYNC_MS = 2000;

function mergeChatMessages(
  current: EntityChatMessage[],
  incoming: EntityChatMessage[]
): EntityChatMessage[] {
  if (current.length === 0) {
    return incoming;
  }

  const knownIds = new Set(current.map((item) => item.id));
  const appended = incoming.filter((item) => !knownIds.has(item.id));

  if (appended.length === 0) {
    return current;
  }

  return [...current, ...appended];
}

interface CardChatCache {
  connection: ReturnType<typeof connectEntityChatSocket> | null;
  hasLoadedMessages: boolean;
  messages: EntityChatMessage[];
  nextCursor: string | null;
  onlineCount: number;
}

const chatCacheByEntity = new Map<string, CardChatCache>();

export function clearCardChatDrawerState(): void {
  for (const cache of chatCacheByEntity.values()) {
    cache.connection?.disconnect();
  }

  chatCacheByEntity.clear();
  expandedStateByEntity.clear();
}

function getChatCache(entityId: string): CardChatCache {
  const existing = chatCacheByEntity.get(entityId);

  if (existing) {
    return existing;
  }

  const cache: CardChatCache = {
    connection: null,
    hasLoadedMessages: false,
    messages: [],
    nextCursor: null,
    onlineCount: 0
  };

  chatCacheByEntity.set(entityId, cache);
  return cache;
}

function disconnectChatCache(entityId: string): void {
  const cache = chatCacheByEntity.get(entityId);
  cache?.connection?.disconnect();

  if (cache) {
    cache.connection = null;
  }
}

export function renderCardChatSectionMarkup(t: TranslateFn, entityId: string): string {
  const expanded = expandedStateByEntity.get(entityId) ?? false;

  return `
    <div class="reviewo-chat-section${expanded ? " is-expanded" : ""}" data-reviewo-chat-section>
      <div class="reviewo-chat-panel${expanded ? " is-open" : ""}" data-reviewo-chat-panel>
        <div class="reviewo-chat-panel-inner">
          <div class="reviewo-chat-host" data-reviewo-chat-host></div>
        </div>
      </div>
      <div class="reviewo-chat-footer" data-reviewo-chat-footer hidden></div>
      <button
        type="button"
        class="reviewo-chat-toggle"
        data-reviewo-chat-toggle
        aria-expanded="${expanded ? "true" : "false"}"
      >
        ${escapeHtmlText(expanded ? t("chat.toggle.close") : t("chat.toggle.open"))}
      </button>
    </div>
  `;
}

export function bindCardChatDrawer(
  container: HTMLElement,
  t: TranslateFn,
  entityId: string,
  options: CardChatDrawerOptions,
  actions: CardChatDrawerActions
): void {
  const toggleButton = container.querySelector<HTMLButtonElement>("[data-reviewo-chat-toggle]");
  const host = container.querySelector<HTMLElement>("[data-reviewo-chat-host]");
  const chatSection = container.querySelector<HTMLElement>("[data-reviewo-chat-section]");
  const chatPanel = container.querySelector<HTMLElement>("[data-reviewo-chat-panel]");
  const chatFooter = container.querySelector<HTMLElement>("[data-reviewo-chat-footer]");

  if (!toggleButton || !host || !chatSection || !chatPanel || !chatFooter) {
    return;
  }

  const cache = getChatCache(entityId);
  let connection = cache.connection;
  let messages = cache.messages;
  let nextCursor = cache.nextCursor;
  let onlineCount = cache.onlineCount;
  let isLoadingOlder = false;
  let hasLoadedMessages = cache.hasLoadedMessages;
  let isBootstrapping = false;
  let onlinePollTimer: number | undefined;
  let messageSyncTimer: number | undefined;
  let isSyncingMessages = false;
  let composerBound = false;

  const syncCache = (): void => {
    cache.connection = connection;
    cache.hasLoadedMessages = hasLoadedMessages;
    cache.messages = messages;
    cache.nextCursor = nextCursor;
    cache.onlineCount = onlineCount;
  };

  const connectLiveUpdates = (): void => {
    if (connection) {
      return;
    }

    connection = connectEntityChatSocket(entityId, options.accessToken, {
      onMessages: (initialMessages) => {
        messages = initialMessages;
        syncCache();
        renderDrawerContent();
      },
      onNewMessage: (message) => {
        if (messages.some((item) => item.id === message.id)) {
          return;
        }

        messages = [...messages, message];
        syncCache();
        renderDrawerContent();
      },
      onOnlineCount: (count) => {
        onlineCount = count;
        syncCache();
        updateOnlineCountUi();
        stopOnlinePolling();
      },
      onDisconnect: () => {
        startOnlinePolling();
      }
    });
    cache.connection = connection;
  };

  const updateOnlineCountUi = (): void => {
    updateChatOnlineCountElement(host, t, onlineCount);
  };

  const refreshOnlineCount = async (): Promise<void> => {
    try {
      const accessToken = options.accessToken ?? (await getExtensionSessionAccessToken());
      const result = accessToken
        ? await pingEntityChatPresence(entityId)
        : await fetchEntityChatOnlineCount(entityId);

      onlineCount = result.onlineCount;
      syncCache();
      updateOnlineCountUi();
    } catch {
      // Keep the last known count visible.
    }
  };

  const syncLatestMessages = async (): Promise<void> => {
    if (isSyncingMessages || !hasLoadedMessages) {
      return;
    }

    isSyncingMessages = true;

    try {
      const page = await fetchEntityChatMessages(entityId, { limit: 100 });
      const mergedMessages = mergeChatMessages(messages, page.messages);

      if (mergedMessages !== messages) {
        messages = mergedMessages;
        nextCursor ??= page.nextCursor;
        syncCache();
        renderDrawerContent();
      }
    } catch {
      // Keep socket as the primary path and use polling only as a live fallback.
    } finally {
      isSyncingMessages = false;
    }
  };

  const startMessageSync = (): void => {
    stopMessageSync();
    void syncLatestMessages();
    messageSyncTimer = window.setInterval(() => {
      void syncLatestMessages();
    }, CHAT_MESSAGE_SYNC_MS);
  };

  const stopMessageSync = (): void => {
    if (messageSyncTimer !== undefined) {
      window.clearInterval(messageSyncTimer);
      messageSyncTimer = undefined;
    }
  };

  const startOnlinePolling = (): void => {
    stopOnlinePolling();
    void refreshOnlineCount();
    onlinePollTimer = window.setInterval(() => {
      void refreshOnlineCount();
    }, CHAT_ONLINE_POLL_MS);
  };

  const stopOnlinePolling = (): void => {
    if (onlinePollTimer !== undefined) {
      window.clearInterval(onlinePollTimer);
      onlinePollTimer = undefined;
    }
  };

  const cardHost = getCardHost(container);
  const cardShell = container.closest<HTMLElement>(".reviewo-card-shell");

  const syncChatCompactChrome = (expanded: boolean): void => {
    cardShell?.classList.toggle("is-chat-expanded", expanded);
    cardHost?.classList.toggle("is-chat-expanded", expanded);

    container
      .querySelectorAll<HTMLElement>(".reviewo-rate-section, .reviewo-settings-tip")
      .forEach((element) => {
        element.hidden = expanded;
      });
  };

  const setExpandedUi = (expanded: boolean): void => {
    toggleButton.textContent = expanded ? t("chat.toggle.close") : t("chat.toggle.open");
    toggleButton.setAttribute("aria-expanded", expanded ? "true" : "false");
    chatSection.classList.toggle("is-expanded", expanded);
    chatPanel.classList.toggle("is-open", expanded);
    chatFooter.hidden = !expanded;
    syncChatCompactChrome(expanded);

    if (cardHost) {
      if (expanded) {
        suspendAutoDismiss(cardHost as AutoDismissHost);
        startOnlinePolling();
      } else {
        chatPanel.classList.remove("is-loading");
        stopOnlinePolling();
        stopMessageSync();
        resumeAutoDismiss(cardHost as AutoDismissHost);
      }
    }
  };

  const ensureComposerBound = (): void => {
    if (composerBound) {
      return;
    }

    chatFooter.innerHTML = renderCardChatComposerMarkup(t, options.isAuthenticated);
    bindCardChatComposer(chatFooter, chatSection, actions, sendMessage);
    composerBound = true;
  };

  const renderDrawerContent = (): void => {
    host.innerHTML = renderCardChatMessagesMarkup(t, onlineCount, messages);
    bindCardChatMessageList(host, loadOlderMessages);
    ensureComposerBound();
    updateOnlineCountUi();
    scrollMessagesToBottom(host.querySelector<HTMLElement>("[data-reviewo-chat-message-list]"));
  };

  const renderDrawer = (): void => {
    const expanded = expandedStateByEntity.get(entityId) ?? false;
    setExpandedUi(expanded);

    if (!expanded) {
      disconnectChatCache(entityId);
      connection = null;
      syncCache();
      stopOnlinePolling();
      stopMessageSync();
      return;
    }

    if (isBootstrapping) {
      return;
    }

    renderDrawerContent();
  };

  toggleButton.addEventListener("click", () => {
    const expanded = expandedStateByEntity.get(entityId) ?? false;
    const nextExpanded = !expanded;
    expandedStateByEntity.set(entityId, nextExpanded);
    setExpandedUi(nextExpanded);

    if (!nextExpanded) {
      disconnectChatCache(entityId);
      connection = null;
      syncCache();
      stopOnlinePolling();
      return;
    }

    startOnlinePolling();

    if (!hasLoadedMessages) {
      void bootstrapChat();
      return;
    }

    connectLiveUpdates();
    startMessageSync();
    renderDrawerContent();
  });

  if (expandedStateByEntity.get(entityId)) {
    setExpandedUi(true);

    if (!hasLoadedMessages) {
      void bootstrapChat();
    } else {
      connectLiveUpdates();
      startMessageSync();
      renderDrawerContent();
    }
  }

  async function bootstrapChat(): Promise<void> {
    if (isBootstrapping || hasLoadedMessages) {
      return;
    }

    isBootstrapping = true;
    chatPanel.classList.add("is-loading");
    host.innerHTML = `<p class="reviewo-meta">${escapeHtmlText(t("chat.loading"))}</p>`;
    chatFooter.hidden = false;

    try {
      const page = await fetchEntityChatMessages(entityId, { limit: 100 });

      messages = page.messages;
      nextCursor = page.nextCursor;

      try {
        const online = await fetchEntityChatOnlineCount(entityId);
        onlineCount = online.onlineCount;
      } catch {
        onlineCount = 0;
      }

      hasLoadedMessages = true;
      syncCache();
      renderDrawerContent();
      connectLiveUpdates();
      startMessageSync();
      void refreshOnlineCount();
    } catch {
      host.innerHTML = `<p class="reviewo-chat-error">${escapeHtmlText(t("chat.loadError"))}</p>`;
    } finally {
      chatPanel.classList.remove("is-loading");
      isBootstrapping = false;
    }
  }

  async function loadOlderMessages(): Promise<void> {
    if (!nextCursor || isLoadingOlder) {
      return;
    }

    isLoadingOlder = true;
    const list = host.querySelector<HTMLElement>("[data-reviewo-chat-message-list]");
    const previousHeight = list?.scrollHeight ?? 0;

    try {
      const page = await fetchEntityChatMessages(entityId, {
        before: nextCursor,
        limit: 50
      });

      messages = [...page.messages, ...messages];
      nextCursor = page.nextCursor;
      syncCache();
      renderDrawerContent();

      const updatedList = host.querySelector<HTMLElement>("[data-reviewo-chat-message-list]");

      if (updatedList) {
        updatedList.scrollTop = updatedList.scrollHeight - previousHeight;
      }
    } finally {
      isLoadingOlder = false;
    }
  }

  async function sendMessage(text: string): Promise<void> {
    const accessToken = options.accessToken ?? (await getExtensionSessionAccessToken());

    if (!accessToken) {
      actions.onRequestSignIn();
      return;
    }

    const status = chatFooter.querySelector<HTMLElement>("[data-reviewo-chat-send-status]");
    const sendButton = chatFooter.querySelector<HTMLButtonElement>(".reviewo-chat-send");
    const input = chatFooter.querySelector<HTMLInputElement>("[data-reviewo-chat-input]");

    if (status) {
      status.hidden = true;
      status.textContent = "";
    }

    if (sendButton) {
      sendButton.disabled = true;
    }

    if (input) {
      input.disabled = true;
    }

    try {
      let created: EntityChatMessage | null = null;

      if (connection?.isReady()) {
        try {
          created = await connection.sendMessage(text);
        } catch {
          created = null;
        }
      }

      if (!created) {
        created = await sendEntityChatMessage(entityId, text, accessToken);
      }

      if (!messages.some((item) => item.id === created.id)) {
        messages = [...messages, created];
        syncCache();
        renderDrawerContent();
      }

      if (input) {
        input.value = "";
      }
    } catch (error) {
      if (status) {
        status.hidden = false;
        status.textContent = formatChatSendErrorMessage(t, error);
      }
    } finally {
      if (sendButton) {
        sendButton.disabled = false;
      }

      if (input) {
        input.disabled = false;
        input.focus();
      }
    }
  }
}

function getCardHost(container: HTMLElement): HTMLElement | null {
  const root = container.getRootNode();

  if (root instanceof ShadowRoot && root.host instanceof HTMLElement) {
    return root.host;
  }

  return null;
}

function scrollMessagesToBottom(list: HTMLElement | null): void {
  if (!list) {
    return;
  }

  requestAnimationFrame(() => {
    list.scrollTop = list.scrollHeight;
  });
}

function renderCardChatMessagesMarkup(
  t: TranslateFn,
  onlineCount: number,
  messages: EntityChatMessage[]
): string {
  const messageMarkup =
    messages.length === 0
      ? `<p class="reviewo-meta">${escapeHtmlText(t("chat.empty"))}</p>`
      : `<ul class="reviewo-chat-message-list" data-reviewo-chat-message-list>
          ${messages
            .map(
              (message) => `
            <li class="reviewo-chat-message">
              <strong>${escapeHtmlText(message.displayName)}:</strong>
              <span>${escapeHtmlText(message.message)}</span>
            </li>
          `
            )
            .join("")}
        </ul>`;

  return `
    <section class="reviewo-chat-drawer" aria-label="${escapeHtmlAttribute(t("chat.title"))}">
      <div class="reviewo-chat-drawer-header">
        <div>
          <h3 class="reviewo-chat-title">${escapeHtmlText(t("chat.title"))}</h3>
          <p class="reviewo-meta" data-reviewo-chat-online-count>${escapeHtmlText(
            formatChatOnlineCountLabel(t, onlineCount)
          )}</p>
        </div>
      </div>
      <div class="reviewo-chat-drawer-body">${messageMarkup}</div>
    </section>
  `;
}

function renderCardChatComposerMarkup(t: TranslateFn, isAuthenticated: boolean): string {
  return `
    <form class="reviewo-chat-composer" data-reviewo-chat-composer>
      <input
        type="text"
        maxlength="2000"
        placeholder="${escapeHtmlAttribute(t("chat.input.placeholder"))}"
        data-reviewo-chat-input
      />
      <button type="submit" class="reviewo-chat-send">
        ${escapeHtmlText(t("chat.send"))}
      </button>
    </form>
    ${
      isAuthenticated
        ? `<p class="reviewo-meta reviewo-chat-send-status" data-reviewo-chat-send-status hidden></p>`
        : `<p class="reviewo-meta reviewo-chat-sign-in-hint">${escapeHtmlText(t("chat.signInRequired"))}</p>`
    }
  `;
}

function bindCardChatComposer(
  footer: HTMLElement,
  chatSection: HTMLElement,
  actions: CardChatDrawerActions,
  sendMessage: (text: string) => Promise<void>
): void {
  const composer = footer.querySelector<HTMLFormElement>("[data-reviewo-chat-composer]");
  const input = footer.querySelector<HTMLInputElement>("[data-reviewo-chat-input]");

  bindChatComposerKeyboardGuard(composer);
  bindChatComposerKeyboardGuard(input);

  composer?.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = input?.value.trim() ?? "";

    if (!value) {
      return;
    }

    void sendMessage(value);
  });

  input?.addEventListener("focus", () => {
    const hint = footer.querySelector(".reviewo-chat-sign-in-hint");

    if (hint) {
      actions.onRequestSignIn();
    }
  });
}

function bindChatComposerKeyboardGuard(target: HTMLElement | null): void {
  if (!target) {
    return;
  }

  const stopPageHotkeyPropagation = (event: Event): void => {
    event.stopPropagation();
  };

  target.addEventListener("keydown", stopPageHotkeyPropagation);
  target.addEventListener("keypress", stopPageHotkeyPropagation);
  target.addEventListener("keyup", stopPageHotkeyPropagation);
}

function bindCardChatMessageList(
  host: HTMLElement,
  loadOlderMessages: () => Promise<void>
): void {
  host.querySelector<HTMLElement>("[data-reviewo-chat-message-list]")?.addEventListener("scroll", (event) => {
    const list = event.currentTarget as HTMLElement;

    if (list.scrollTop <= 24) {
      void loadOlderMessages();
    }
  });
}

function escapeHtmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtmlText(value);
}
