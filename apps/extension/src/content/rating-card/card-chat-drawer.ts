import type { TranslateFn } from "@reviewo/i18n";
import {
  appendEntityChatMessageNewest,
  ENTITY_CHAT_CARD_CACHE_MAX_ENTRIES,
  ENTITY_CHAT_CLIENT_INITIAL_LIMIT,
  ENTITY_CHAT_CLIENT_OLDER_LIMIT,
  mergeEntityChatMessagesNewest,
  prependEntityChatMessagesOldest,
  resolveEntityChatOlderCursor,
  trimEntityChatMessagesNewest
} from "@reviewo/shared";

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
  bindEntityChatLocaleSwitch,
  buildEntityChatConnectionKey,
  DEFAULT_ENTITY_CHAT_LOCALE,
  renderEntityChatLocaleSelectorMarkup,
  updateEntityChatLocaleSelectorUi,
  type EntityChatLocale
} from "../../shared/entity-chat/locale.js";
import {
  CHAT_ONLINE_POLL_MS,
  formatChatOnlineCountLabel,
  formatChatSendErrorMessage,
  updateChatOnlineCountElement
} from "../../shared/entity-chat/chat-ui-helpers.js";
import {
  appendChatMessagesToList,
  captureChatListScrollAnchor,
  CARD_CHAT_MESSAGE_LIST_DOM,
  prependChatMessagesToList,
  replaceChatMessageList,
  scrollChatListToBottom
} from "../../shared/entity-chat/chat-message-list-dom.js";
import { LruMap } from "../../shared/entity-chat/chat-cache-lru.js";

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
const localeByEntity = new Map<string, EntityChatLocale>();
const CHAT_MESSAGE_SYNC_MS = 2000;

interface CardChatCache {
  connection: ReturnType<typeof connectEntityChatSocket> | null;
  hasLoadedMessages: boolean;
  messages: EntityChatMessage[];
  nextCursor: string | null;
  onlineCount: number;
}

const chatCacheByEntity = new LruMap<CardChatCache>(ENTITY_CHAT_CARD_CACHE_MAX_ENTRIES);

function evictChatCache(_key: string, cache: CardChatCache): void {
  cache.connection?.disconnect();
}

export function clearCardChatDrawerState(): void {
  chatCacheByEntity.clear(evictChatCache);
  expandedStateByEntity.clear();
}

function getChatCache(entityId: string, locale: EntityChatLocale): CardChatCache {
  const key = buildEntityChatConnectionKey(entityId, locale);
  const existing = chatCacheByEntity.get(key);

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

  chatCacheByEntity.set(key, cache, evictChatCache);
  return cache;
}

function disconnectChatCache(entityId: string, locale: EntityChatLocale): void {
  const key = buildEntityChatConnectionKey(entityId, locale);
  const cache = chatCacheByEntity.get(key);
  cache?.connection?.disconnect();

  if (cache) {
    cache.connection = null;
    chatCacheByEntity.set(key, cache, evictChatCache);
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

  let cache = getChatCache(entityId, localeByEntity.get(entityId) ?? DEFAULT_ENTITY_CHAT_LOCALE);
  let chatLocale = localeByEntity.get(entityId) ?? DEFAULT_ENTITY_CHAT_LOCALE;
  let connection = cache.connection;
  let messages = cache.messages;
  let nextCursor = cache.nextCursor;
  let onlineCount = cache.onlineCount;
  let isLoadingOlder = false;
  let hasLoadedMessages = cache.hasLoadedMessages;
  let chatLoadGeneration = 0;
  let onlinePollTimer: number | undefined;
  let messageSyncTimer: number | undefined;
  let isSyncingMessages = false;
  let composerBound = false;

  const readCacheKey = (): string => buildEntityChatConnectionKey(entityId, chatLocale);

  const bumpChatLoadGeneration = (): number => {
    chatLoadGeneration += 1;
    return chatLoadGeneration;
  };

  const isStaleChatLoad = (generation: number): boolean => generation !== chatLoadGeneration;

  const syncCache = (): void => {
    cache.connection = connection;
    cache.hasLoadedMessages = hasLoadedMessages;
    cache.messages = messages;
    cache.nextCursor = nextCursor;
    cache.onlineCount = onlineCount;
    chatCacheByEntity.set(readCacheKey(), cache, evictChatCache);
  };

  const connectLiveUpdates = (): void => {
    if (connection) {
      return;
    }

    connection = connectEntityChatSocket(entityId, chatLocale, options.accessToken, {
      onMessages: (initialMessages, incomingNextCursor) => {
        messages = mergeEntityChatMessagesNewest(messages, initialMessages);

        if (incomingNextCursor !== undefined) {
          nextCursor = resolveEntityChatOlderCursor(messages.length, incomingNextCursor, nextCursor);
        }

        syncCache();
        syncMessagesToDom();
      },
      onNewMessage: (message) => {
        messages = appendEntityChatMessageNewest(messages, message);
        syncCache();
        syncMessagesToDom();
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
        ? await pingEntityChatPresence(entityId, chatLocale)
        : await fetchEntityChatOnlineCount(entityId, chatLocale);

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
      const page = await fetchEntityChatMessages(entityId, {
        limit: ENTITY_CHAT_CLIENT_INITIAL_LIMIT,
        locale: chatLocale
      });
      const mergedMessages = mergeEntityChatMessagesNewest(messages, page.messages);

      if (mergedMessages !== messages) {
        messages = mergedMessages;
        nextCursor = resolveEntityChatOlderCursor(messages.length, page.nextCursor, nextCursor);
        syncCache();
        syncMessagesToDom();
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

    const card = container.closest<HTMLElement>(".reviewo-card");

    if (card && expanded) {
      card.style.height = "";
      card.style.overflow = "";
      card.style.transition = "";
    }

    container
      .querySelectorAll<HTMLElement>(
        ".reviewo-rate-section, .reviewo-settings-tip, .reviewo-reviews-panel"
      )
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

  const switchChatLocale = (nextLocale: EntityChatLocale): void => {
    if (nextLocale === chatLocale && hasLoadedMessages) {
      return;
    }

    disconnectChatCache(entityId, chatLocale);
    connection = null;
    stopOnlinePolling();
    stopMessageSync();

    chatLocale = nextLocale;
    localeByEntity.set(entityId, chatLocale);
    cache = getChatCache(entityId, chatLocale);
    connection = cache.connection;
    messages = cache.messages;
    nextCursor = cache.nextCursor;
    onlineCount = cache.onlineCount;
    hasLoadedMessages = cache.hasLoadedMessages;

    if (host.querySelector(".reviewo-chat-drawer")) {
      updateEntityChatLocaleSelectorUi(host, chatLocale);
    }

    if (!(expandedStateByEntity.get(entityId) ?? false)) {
      return;
    }

    if (!hasLoadedMessages) {
      void bootstrapChat(bumpChatLoadGeneration());
      return;
    }

    mountDrawer(true);
    startOnlinePolling();
    connectLiveUpdates();
    startMessageSync();
  };

  const getMessageListBody = (): HTMLElement | null =>
    host.querySelector<HTMLElement>("[data-reviewo-chat-drawer-body]");

  const updateLoadOlderButton = (): void => {
    const button = host.querySelector<HTMLButtonElement>("[data-reviewo-chat-load-older]");

    if (!button) {
      return;
    }

    button.disabled = !nextCursor || isLoadingOlder;
    button.textContent = t(isLoadingOlder ? "chat.loadingOlder" : "chat.loadOlder");
  };

  const getMessageList = (): HTMLElement | null =>
    host.querySelector<HTMLElement>(CARD_CHAT_MESSAGE_LIST_DOM.listSelector);

  const scrollMessageListToBottom = (): void => {
    scrollChatListToBottom(getMessageList());
  };

  const syncMessagesToDom = (): void => {
    const body = getMessageListBody();

    if (!body) {
      return;
    }

    if (messages.length > 0 && !host.querySelector("[data-reviewo-chat-load-older]")) {
      mountDrawer(false);
      return;
    }

    const list = body.querySelector<HTMLElement>(CARD_CHAT_MESSAGE_LIST_DOM.listSelector);

    if (messages.length === 0) {
      replaceChatMessageList(body, [], t("chat.empty"), CARD_CHAT_MESSAGE_LIST_DOM, escapeHtmlText);
      updateLoadOlderButton();
      return;
    }

    if (!list) {
      replaceChatMessageList(body, messages, t("chat.empty"), CARD_CHAT_MESSAGE_LIST_DOM, escapeHtmlText);
      updateLoadOlderButton();
      return;
    }

    appendChatMessagesToList(list, messages, CARD_CHAT_MESSAGE_LIST_DOM, escapeHtmlText);
    updateLoadOlderButton();
  };

  const mountDrawer = (scrollToBottom = true): void => {
    host.innerHTML = renderCardChatMessagesMarkup(t, onlineCount, chatLocale, {
      isLoadingOlder,
      nextCursor,
      showLoadOlder: messages.length > 0
    });
    bindEntityChatLocaleSwitch(host, switchChatLocale);
    host.querySelector<HTMLButtonElement>("[data-reviewo-chat-load-older]")?.addEventListener("click", () => {
      void loadOlderMessages();
    });
    ensureComposerBound();

    const body = getMessageListBody();

    if (body) {
      replaceChatMessageList(body, messages, t("chat.empty"), CARD_CHAT_MESSAGE_LIST_DOM, escapeHtmlText);
    }

    updateOnlineCountUi();

    if (scrollToBottom) {
      requestAnimationFrame(() => {
        scrollMessageListToBottom();
      });
    }
  };

  const ensureDrawerMounted = (scrollToBottom = false): void => {
    if (host.querySelector(".reviewo-chat-drawer")) {
      syncMessagesToDom();
      updateOnlineCountUi();

      if (scrollToBottom) {
        requestAnimationFrame(() => {
          scrollMessageListToBottom();
        });
      }

      return;
    }

    mountDrawer(scrollToBottom);
  };

  const renderDrawerContent = (): void => {
    ensureDrawerMounted(true);
  };

  const renderDrawer = (): void => {
    const expanded = expandedStateByEntity.get(entityId) ?? false;
    setExpandedUi(expanded);

    if (!expanded) {
      disconnectChatCache(entityId, chatLocale);
      connection = null;
      syncCache();
      stopOnlinePolling();
      stopMessageSync();
      return;
    }

    if (chatPanel.classList.contains("is-loading")) {
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
      disconnectChatCache(entityId, chatLocale);
      connection = null;
      syncCache();
      stopOnlinePolling();
      return;
    }

    startOnlinePolling();

    if (!hasLoadedMessages) {
      void bootstrapChat(bumpChatLoadGeneration());
      return;
    }

    connectLiveUpdates();
    startMessageSync();
    renderDrawerContent();
  });

  if (expandedStateByEntity.get(entityId)) {
    setExpandedUi(true);

    if (!hasLoadedMessages) {
      void bootstrapChat(bumpChatLoadGeneration());
    } else {
      connectLiveUpdates();
      startMessageSync();
      renderDrawerContent();
    }
  }

  async function bootstrapChat(generation: number): Promise<void> {
    if (isStaleChatLoad(generation)) {
      return;
    }

    if (hasLoadedMessages) {
      return;
    }

    chatPanel.classList.add("is-loading");
    host.innerHTML = `<p class="reviewo-meta">${escapeHtmlText(t("chat.loading"))}</p>`;
    chatFooter.hidden = false;
    const locale = chatLocale;

    try {
      const page = await fetchEntityChatMessages(entityId, {
        limit: ENTITY_CHAT_CLIENT_INITIAL_LIMIT,
        locale
      });

      if (isStaleChatLoad(generation) || chatLocale !== locale) {
        return;
      }

      messages = trimEntityChatMessagesNewest(page.messages);
      nextCursor = page.nextCursor;

      try {
        const online = await fetchEntityChatOnlineCount(entityId, locale);
        onlineCount = online.onlineCount;
      } catch {
        onlineCount = 0;
      }

      if (isStaleChatLoad(generation) || chatLocale !== locale) {
        return;
      }

      hasLoadedMessages = true;
      syncCache();
      mountDrawer();
      connectLiveUpdates();
      startMessageSync();
      void refreshOnlineCount();
    } catch {
      if (!isStaleChatLoad(generation) && chatLocale === locale) {
        host.innerHTML = `<p class="reviewo-chat-error">${escapeHtmlText(t("chat.loadError"))}</p>`;
      }
    } finally {
      if (!isStaleChatLoad(generation)) {
        chatPanel.classList.remove("is-loading");
      }
    }
  }

  async function loadOlderMessages(): Promise<void> {
    if (!nextCursor || isLoadingOlder) {
      return;
    }

    const list = host.querySelector<HTMLElement>(CARD_CHAT_MESSAGE_LIST_DOM.listSelector);
    const anchor = list ? captureChatListScrollAnchor(list) : null;

    isLoadingOlder = true;
    updateLoadOlderButton();

    try {
      const page = await fetchEntityChatMessages(entityId, {
        before: nextCursor,
        limit: ENTITY_CHAT_CLIENT_OLDER_LIMIT,
        locale: chatLocale
      });

      messages = prependEntityChatMessagesOldest(messages, page.messages);
      nextCursor = page.nextCursor;
      syncCache();

      if (list && anchor) {
        prependChatMessagesToList(list, page.messages, CARD_CHAT_MESSAGE_LIST_DOM, escapeHtmlText, anchor);
      } else {
        const body = getMessageListBody();

        if (body) {
          replaceChatMessageList(
            body,
            messages,
            t("chat.empty"),
            CARD_CHAT_MESSAGE_LIST_DOM,
            escapeHtmlText,
            anchor
          );
        }
      }
    } finally {
      isLoadingOlder = false;
      updateLoadOlderButton();
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
        created = await sendEntityChatMessage(entityId, text, accessToken, chatLocale);
      }

      if (!messages.some((item) => item.id === created.id)) {
        messages = appendEntityChatMessageNewest(messages, created);
        syncCache();
        syncMessagesToDom();
      }

      scrollMessageListToBottom();

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

function renderCardChatMessagesMarkup(
  t: TranslateFn,
  onlineCount: number,
  chatLocale: EntityChatLocale,
  options: { isLoadingOlder: boolean; nextCursor: string | null; showLoadOlder: boolean }
): string {
  const loadOlderButtonMarkup = options.showLoadOlder
    ? `<button
          type="button"
          class="reviewo-chat-load-older"
          data-reviewo-chat-load-older
          ${!options.nextCursor || options.isLoadingOlder ? "disabled" : ""}
        >
          ${escapeHtmlText(options.isLoadingOlder ? t("chat.loadingOlder") : t("chat.loadOlder"))}
        </button>`
    : "";

  return `
    <section class="reviewo-chat-drawer" aria-label="${escapeHtmlAttribute(t("chat.title"))}">
      <div class="reviewo-chat-drawer-header">
        <div class="reviewo-chat-drawer-header-main">
          <div class="reviewo-chat-drawer-header-top">
            <h3 class="reviewo-chat-title">${escapeHtmlText(t("chat.title"))}</h3>
            <div class="reviewo-chat-drawer-header-top-center">${loadOlderButtonMarkup}</div>
            ${renderEntityChatLocaleSelectorMarkup(chatLocale)}
          </div>
          <p class="reviewo-meta" data-reviewo-chat-online-count>${escapeHtmlText(
            formatChatOnlineCountLabel(t, onlineCount)
          )}</p>
        </div>
      </div>
      <div class="reviewo-chat-drawer-body" data-reviewo-chat-drawer-body></div>
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
