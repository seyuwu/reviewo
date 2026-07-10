import type { TranslateFn } from "@reviewo/i18n";
import {
  appendEntityChatMessageNewest,
  ENTITY_CHAT_CLIENT_INITIAL_LIMIT,
  ENTITY_CHAT_CLIENT_OLDER_LIMIT,
  mergeEntityChatMessagesNewest,
  prependEntityChatMessagesOldest,
  resolveEntityChatOlderCursor,
  trimEntityChatMessagesNewest
} from "@reviewo/shared";

import { escapeHtml } from "../view-helpers.js";
import type { EntityChatMessage } from "../services/entity-chat-api.js";
import {
  fetchEntityChatMessages,
  fetchEntityChatOnlineCount,
  pingEntityChatPresence,
  sendEntityChatMessage
} from "../services/entity-chat-api.js";
import { connectEntityChatSocket } from "../services/entity-chat-socket.js";
import {
  CHAT_ONLINE_POLL_MS,
  formatChatOnlineCountLabel,
  formatChatSendErrorMessage,
  updateChatOnlineCountElement
} from "../../shared/entity-chat/chat-ui-helpers.js";
import {
  appendChatMessagesToList,
  captureChatListScrollAnchor,
  POPUP_CHAT_MESSAGE_LIST_DOM,
  prependChatMessagesToList,
  replaceChatMessageList,
  scrollChatListToBottom
} from "../../shared/entity-chat/chat-message-list-dom.js";
import {
  bindEntityChatLocaleSwitch,
  buildEntityChatConnectionKey,
  DEFAULT_ENTITY_CHAT_LOCALE,
  ENTITY_CHAT_LOCALES,
  renderEntityChatLocaleSelectorMarkup,
  updateEntityChatLocaleSelectorUi,
  type EntityChatLocale
} from "../../shared/entity-chat/locale.js";
import {
  applyChatDrawerHeight,
  bindChatDrawerResizeHandle,
  popupChatDrawerResizeConfig,
  readStoredChatDrawerHeight
} from "../../shared/entity-chat/chat-drawer-resize.js";

export interface ChatDrawerActions {
  onExpandedChange?: (expanded: boolean) => void;
  onRequestSignIn: () => void;
}

export interface ChatDrawerMountOptions {
  accessToken: string | null;
  currentUserId?: string;
  entityId: string;
  entityTitle: string;
  initialChatLocale?: EntityChatLocale;
  isAuthenticated: boolean;
}

const expandedStateByEntity = new Map<string, boolean>();
const localeByEntity = new Map<string, EntityChatLocale>();
const liveConnectionByEntity = new Map<string, ReturnType<typeof connectEntityChatSocket>>();
const POPUP_CHAT_PANEL_ANIMATION_MS = 360;
const CHAT_MESSAGE_SYNC_MS = 2000;

export function resetPopupChatDrawerSessionState(): void {
  for (const connection of liveConnectionByEntity.values()) {
    connection.disconnect();
  }

  liveConnectionByEntity.clear();
  expandedStateByEntity.clear();
  setPopupChatExpanded(false);
}

export function setPopupChatExpanded(expanded: boolean): void {
  document.documentElement.classList.toggle("popup-chat-expanded", expanded);
  document.body.classList.toggle("popup-chat-expanded", expanded);
  document.querySelector<HTMLElement>(".popup-body")?.classList.toggle("popup-chat-expanded", expanded);
  document.querySelector<HTMLElement>(".screen-host")?.classList.toggle("popup-chat-expanded", expanded);
}

export function renderChatDrawerToggleMarkup(t: TranslateFn, entityId: string): string {
  const expanded = expandedStateByEntity.get(entityId) ?? false;

  return `
    <button
      type="button"
      class="chat-toggle-button"
      data-chat-toggle
      aria-expanded="${expanded ? "true" : "false"}"
    >
      ${escapeHtml(expanded ? t("chat.toggle.close") : t("chat.toggle.open"))}
    </button>
  `;
}

export function renderChatDrawerHostMarkup(): string {
  return `<div class="chat-drawer-host" data-chat-drawer-host></div>`;
}

export function renderChatDrawerSectionMarkup(t: TranslateFn, entityId: string): string {
  const expanded = expandedStateByEntity.get(entityId) ?? false;

  return `
    <div class="chat-drawer-panel${expanded ? " is-open" : ""}" data-chat-drawer-panel>
      <div class="chat-drawer-panel-inner">
        ${renderChatDrawerHostMarkup()}
      </div>
    </div>
    ${renderChatDrawerToggleMarkup(t, entityId)}
  `;
}

export function bindChatDrawerToggle(
  container: HTMLElement,
  t: TranslateFn,
  entityId: string,
  options: ChatDrawerMountOptions,
  actions: ChatDrawerActions
): void {
  const toggleButton = container.querySelector<HTMLButtonElement>("[data-chat-toggle]");
  const host = container.querySelector<HTMLElement>("[data-chat-drawer-host]");
  const chatPanel = container.querySelector<HTMLElement>("[data-chat-drawer-panel]");

  if (!toggleButton || !host || !chatPanel) {
    return;
  }

  for (const locale of ENTITY_CHAT_LOCALES) {
    const connectionKey = buildEntityChatConnectionKey(entityId, locale);
    liveConnectionByEntity.get(connectionKey)?.disconnect();
    liveConnectionByEntity.delete(connectionKey);
  }

  let connection: ReturnType<typeof connectEntityChatSocket> | null = null;
  let chatLocale = localeByEntity.get(entityId) ?? options.initialChatLocale ?? DEFAULT_ENTITY_CHAT_LOCALE;
  const readConnectionKey = (): string => buildEntityChatConnectionKey(entityId, chatLocale);
  let messages: EntityChatMessage[] = [];
  let nextCursor: string | null = null;
  let onlineCount = 0;
  let isLoadingOlder = false;
  let hasLoadedMessages = false;
  let chatLoadGeneration = 0;
  let onlinePollTimer: number | undefined;
  let messageSyncTimer: number | undefined;
  let isSyncingMessages = false;
  let closeLayoutTimer: number | undefined;

  const bumpChatLoadGeneration = (): number => {
    chatLoadGeneration += 1;
    return chatLoadGeneration;
  };

  const isStaleChatLoad = (generation: number): boolean => generation !== chatLoadGeneration;

  const cancelCloseLayoutTimer = (): void => {
    if (closeLayoutTimer !== undefined) {
      window.clearTimeout(closeLayoutTimer);
      closeLayoutTimer = undefined;
    }
  };

  const updateOnlineCountUi = (): void => {
    if (!host) {
      return;
    }

    updateChatOnlineCountElement(host, t, onlineCount);
  };

  const refreshOnlineCount = async (): Promise<void> => {
    if (!host) {
      return;
    }

    try {
      const result = options.accessToken
        ? await pingEntityChatPresence(entityId, options.accessToken, chatLocale)
        : await fetchEntityChatOnlineCount(entityId, chatLocale);

      onlineCount = result.onlineCount;
      updateOnlineCountUi();
    } catch {
      // Keep the last known count visible.
    }
  };

  const startOnlinePolling = (): void => {
    stopOnlinePolling();
    if (!connection?.isReady()) {
      void refreshOnlineCount();
    }
    onlinePollTimer = window.setInterval(() => {
      if (!connection?.isReady()) {
        void refreshOnlineCount();
      }
    }, CHAT_ONLINE_POLL_MS);
  };

  const stopOnlinePolling = (): void => {
    if (onlinePollTimer !== undefined) {
      window.clearInterval(onlinePollTimer);
      onlinePollTimer = undefined;
    }
  };

  const syncLatestMessages = async (): Promise<void> => {
    if (!host || isSyncingMessages || !hasLoadedMessages) {
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
        syncMessagesToDom();
      }
    } catch {
      // Socket is the primary path; this is only a live sync fallback.
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

        syncMessagesToDom();
      },
      onNewMessage: (message) => {
        messages = appendEntityChatMessageNewest(messages, message);
        syncMessagesToDom();
      },
      onOnlineCount: (count) => {
        onlineCount = count;
        updateOnlineCountUi();
        stopOnlinePolling();
      },
      onDisconnect: () => {
        startOnlinePolling();
      }
    });
    liveConnectionByEntity.set(readConnectionKey(), connection);
  };

  const switchChatLocale = (nextLocale: EntityChatLocale): void => {
    if (nextLocale === chatLocale && hasLoadedMessages) {
      return;
    }

    connection?.disconnect();
    connection = null;
    liveConnectionByEntity.delete(readConnectionKey());
    stopOnlinePolling();
    stopMessageSync();

    chatLocale = nextLocale;
    localeByEntity.set(entityId, chatLocale);
    messages = [];
    nextCursor = null;
    hasLoadedMessages = false;

    if (host.querySelector(".chat-drawer")) {
      updateEntityChatLocaleSelectorUi(host, chatLocale, { surface: "popup" });
    }

    if (!(expandedStateByEntity.get(entityId) ?? false)) {
      return;
    }

    const generation = bumpChatLoadGeneration();
    startOnlinePolling();
    void bootstrapChat(generation);
  };

  const getMessageListBody = (): HTMLElement | null =>
    host.querySelector<HTMLElement>("[data-chat-drawer-body]");

  const updateLoadOlderButton = (): void => {
    const button = host.querySelector<HTMLButtonElement>("[data-chat-load-older]");

    if (!button) {
      return;
    }

    button.disabled = !nextCursor || isLoadingOlder;
    button.textContent = t(isLoadingOlder ? "chat.loadingOlder" : "chat.loadOlder");
  };

  const getMessageList = (): HTMLElement | null =>
    host.querySelector<HTMLElement>(POPUP_CHAT_MESSAGE_LIST_DOM.listSelector);

  const scrollMessageListToBottom = (): void => {
    scrollChatListToBottom(getMessageList());
  };

  const syncMessagesToDom = (): void => {
    const body = getMessageListBody();

    if (!body) {
      return;
    }

    if (messages.length > 0 && !host.querySelector("[data-chat-load-older]")) {
      mountDrawer(false);
      return;
    }

    const list = body.querySelector<HTMLElement>(POPUP_CHAT_MESSAGE_LIST_DOM.listSelector);

    if (messages.length === 0) {
      replaceChatMessageList(body, [], t("chat.empty"), POPUP_CHAT_MESSAGE_LIST_DOM, escapeHtml);
      updateLoadOlderButton();
      return;
    }

    if (!list) {
      replaceChatMessageList(body, messages, t("chat.empty"), POPUP_CHAT_MESSAGE_LIST_DOM, escapeHtml);
      updateLoadOlderButton();
      return;
    }

    appendChatMessagesToList(list, messages, POPUP_CHAT_MESSAGE_LIST_DOM, escapeHtml);
    updateLoadOlderButton();
  };

  const mountDrawer = (scrollToBottom = true): void => {
    if (!host) {
      return;
    }

    host.innerHTML = renderChatDrawerMarkup(
      t,
      onlineCount,
      chatLocale,
      {
        isAuthenticated: options.isAuthenticated,
        isLoadingOlder,
        nextCursor,
        showLoadOlder: messages.length > 0
      }
    );
    bindChatDrawerControls(host, t, options, actions, {
      loadOlderMessages,
      sendMessage,
      switchChatLocale
    });

    const body = getMessageListBody();

    if (body) {
      replaceChatMessageList(body, messages, t("chat.empty"), POPUP_CHAT_MESSAGE_LIST_DOM, escapeHtml);
    }

    syncDrawerHeight();
    updateOnlineCountUi();

    if (document.documentElement.classList.contains("popup-chat-expanded")) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          syncDrawerHeight();
        });
      });
    }

    if (scrollToBottom) {
      requestAnimationFrame(() => {
        scrollMessageListToBottom();
      });
    }
  };

  const ensureDrawerMounted = (scrollToBottom = false): void => {
    if (host.querySelector(".chat-drawer")) {
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

  const syncDrawerHeight = (): void => {
    const drawer = host.querySelector<HTMLElement>(".chat-drawer");
    const isFullPopupChat = document.documentElement.classList.contains("popup-chat-expanded");

    if (!drawer) {
      const fallback = Math.min(
        readStoredChatDrawerHeight(popupChatDrawerResizeConfig),
        popupChatDrawerResizeConfig.getMaxHeightPx()
      );
      chatPanel.style.setProperty("--reviewo-chat-panel-max-height", `${fallback}px`);
      return;
    }

    if (isFullPopupChat) {
      const maxHeight = popupChatDrawerResizeConfig.getMaxHeightPx();
      const storedHeight = readStoredChatDrawerHeight(popupChatDrawerResizeConfig);
      const height = Math.min(Math.max(storedHeight, popupChatDrawerResizeConfig.minHeightPx), maxHeight);
      drawer.style.height = `${height}px`;
      drawer.style.maxHeight = `${height}px`;
      chatPanel.style.setProperty("--reviewo-chat-panel-max-height", `${height}px`);
      return;
    }

    const height = applyChatDrawerHeight(drawer, popupChatDrawerResizeConfig);
    chatPanel.style.setProperty("--reviewo-chat-panel-max-height", `${height}px`);
  };

  const clearDrawerInlineSize = (): void => {
    host.querySelector<HTMLElement>(".chat-drawer")?.style.removeProperty("height");
    host.querySelector<HTMLElement>(".chat-drawer")?.style.removeProperty("max-height");
  };

  const beginPanelCloseAnimation = (): void => {
    chatPanel.classList.add("is-closing");
  };

  const finishPanelClose = (): void => {
    cancelCloseLayoutTimer();
    chatPanel.removeEventListener("transitionend", onPanelTransitionEnd);

    if (!chatPanel.classList.contains("is-closing")) {
      return;
    }

    chatPanel.classList.remove("is-open", "is-closing");
    chatPanel.style.removeProperty("--reviewo-chat-panel-max-height");
    clearDrawerInlineSize();
    container.classList.remove("is-chat-expanded");
    connection?.disconnect();
    connection = null;
    liveConnectionByEntity.delete(readConnectionKey());
    stopMessageSync();

    requestAnimationFrame(() => {
      setPopupChatExpanded(false);
    });
  };

  const onPanelTransitionEnd = (event: TransitionEvent): void => {
    const panelInner = chatPanel.querySelector<HTMLElement>(".chat-drawer-panel-inner");

    if (event.target !== panelInner || event.propertyName !== "opacity") {
      return;
    }

    if (!chatPanel.classList.contains("is-closing")) {
      return;
    }

    finishPanelClose();
  };

  const setExpandedUi = (expanded: boolean): void => {
    cancelCloseLayoutTimer();
    chatPanel.removeEventListener("transitionend", onPanelTransitionEnd);

    toggleButton.textContent = expanded ? t("chat.toggle.close") : t("chat.toggle.open");
    toggleButton.setAttribute("aria-expanded", expanded ? "true" : "false");
    actions.onExpandedChange?.(expanded);

    if (expanded) {
      chatPanel.classList.remove("is-closing");
      chatPanel.classList.add("is-open");
      container.classList.add("is-chat-expanded");
      setPopupChatExpanded(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          syncDrawerHeight();
        });
      });
      return;
    }

    chatPanel.classList.remove("is-loading");
    connection?.disconnect();
    connection = null;
    liveConnectionByEntity.delete(readConnectionKey());
    stopOnlinePolling();
    stopMessageSync();

    if (!chatPanel.classList.contains("is-open")) {
      chatPanel.classList.remove("is-closing");
      container.classList.remove("is-chat-expanded");
      setPopupChatExpanded(false);
      chatPanel.style.removeProperty("--reviewo-chat-panel-max-height");
      clearDrawerInlineSize();
      return;
    }

    requestAnimationFrame(() => {
      beginPanelCloseAnimation();
    });

    chatPanel.addEventListener("transitionend", onPanelTransitionEnd);
    closeLayoutTimer = window.setTimeout(finishPanelClose, POPUP_CHAT_PANEL_ANIMATION_MS + 80);
  };

  const renderDrawer = (): void => {
    const expanded = expandedStateByEntity.get(entityId) ?? false;
    setExpandedUi(expanded);

    if (!expanded) {
      return;
    }

    if (chatPanel.classList.contains("is-loading")) {
      return;
    }

    ensureDrawerMounted(true);
  };

  toggleButton.addEventListener("click", () => {
    if (chatPanel.classList.contains("is-closing") || chatPanel.classList.contains("is-loading")) {
      return;
    }

    const expanded = expandedStateByEntity.get(entityId) ?? false;
    const nextExpanded = !expanded;
    expandedStateByEntity.set(entityId, nextExpanded);
    setExpandedUi(nextExpanded);

    if (!nextExpanded) {
      return;
    }

    startOnlinePolling();

    if (!hasLoadedMessages) {
      void bootstrapChat(bumpChatLoadGeneration());
      return;
    }

    connectLiveUpdates();
    startMessageSync();
    ensureDrawerMounted(true);
  });

  if (expandedStateByEntity.get(entityId)) {
    setExpandedUi(true);
    startOnlinePolling();

    if (!hasLoadedMessages) {
      void bootstrapChat(bumpChatLoadGeneration());
    } else {
      connectLiveUpdates();
      startMessageSync();
      ensureDrawerMounted(true);
    }
  }

  async function bootstrapChat(generation: number): Promise<void> {
    if (!host || isStaleChatLoad(generation)) {
      return;
    }

    if (hasLoadedMessages) {
      return;
    }

    chatPanel.classList.add("is-loading");
    host.innerHTML = `<p class="muted-copy">${escapeHtml(t("chat.loading"))}</p>`;
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
      mountDrawer();
      connectLiveUpdates();
      startMessageSync();
      void refreshOnlineCount();
    } catch {
      if (!isStaleChatLoad(generation) && chatLocale === locale && host) {
        host.innerHTML = `<p class="status-copy-error">${escapeHtml(t("chat.loadError"))}</p>`;
      }
    } finally {
      if (!isStaleChatLoad(generation)) {
        chatPanel.classList.remove("is-loading");
      }
    }
  }

  async function loadOlderMessages(): Promise<void> {
    if (!nextCursor || isLoadingOlder || !host) {
      return;
    }

    const list = host.querySelector<HTMLElement>(POPUP_CHAT_MESSAGE_LIST_DOM.listSelector);
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

      if (list && anchor) {
        prependChatMessagesToList(list, page.messages, POPUP_CHAT_MESSAGE_LIST_DOM, escapeHtml, anchor);
      } else {
        const body = getMessageListBody();

        if (body) {
          replaceChatMessageList(
            body,
            messages,
            t("chat.empty"),
            POPUP_CHAT_MESSAGE_LIST_DOM,
            escapeHtml,
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
    if (!host) {
      return;
    }

    if (!options.isAuthenticated || !options.accessToken) {
      actions.onRequestSignIn();
      return;
    }

    const status = host.querySelector<HTMLElement>("[data-chat-send-status]");
    const sendButton = host.querySelector<HTMLButtonElement>("[data-chat-composer] button[type='submit']");
    const input = host.querySelector<HTMLInputElement>("[data-chat-input]");

    if (status) {
      status.hidden = true;
      status.textContent = "";
      status.classList.remove("status-copy-error");
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
        created = await sendEntityChatMessage(entityId, text, options.accessToken, chatLocale);
      }

      if (!messages.some((item) => item.id === created.id)) {
        messages = appendEntityChatMessageNewest(messages, created);
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
        status.classList.add("status-copy-error");
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

function renderChatDrawerMarkup(
  t: TranslateFn,
  onlineCount: number,
  chatLocale: EntityChatLocale,
  options: {
    isAuthenticated: boolean;
    isLoadingOlder: boolean;
    nextCursor: string | null;
    showLoadOlder: boolean;
  }
): string {
  const loadOlderButtonMarkup = options.showLoadOlder
    ? `<button
          type="button"
          class="chat-load-older-button"
          data-chat-load-older
          ${!options.nextCursor || options.isLoadingOlder ? "disabled" : ""}
        >
          ${escapeHtml(options.isLoadingOlder ? t("chat.loadingOlder") : t("chat.loadOlder"))}
        </button>`
    : "";

  return `
    <section class="chat-drawer" aria-label="${escapeHtml(t("chat.title"))}">
      <div class="chat-drawer-header">
        <div class="chat-drawer-header-main">
          <div class="chat-drawer-header-top">
            <h3>${escapeHtml(t("chat.title"))}</h3>
            <div class="chat-drawer-header-top-center">${loadOlderButtonMarkup}</div>
            ${renderEntityChatLocaleSelectorMarkup(chatLocale, { surface: "popup" })}
          </div>
          <p class="muted-copy" data-chat-online-count>${escapeHtml(
            formatChatOnlineCountLabel(t, onlineCount)
          )}</p>
        </div>
      </div>
      <div class="chat-drawer-body" data-chat-drawer-body></div>
      <div class="chat-drawer-footer">
        <form class="chat-composer" data-chat-composer>
          <input
            type="text"
            maxlength="2000"
            placeholder="${escapeHtml(t("chat.input.placeholder"))}"
            data-chat-input
            ${options.isAuthenticated ? "" : "disabled"}
          />
          <button type="submit" class="secondary-button"${options.isAuthenticated ? "" : " disabled"}>
            ${escapeHtml(t("chat.send"))}
          </button>
        </form>
        ${
          options.isAuthenticated
            ? `<p class="muted-copy chat-send-status" data-chat-send-status hidden></p>`
            : `<p class="muted-copy chat-sign-in-hint">${escapeHtml(t("chat.signInRequired"))}</p>`
        }
        <div
          class="chat-drawer-resize-handle"
          data-chat-resize-handle
          role="separator"
          aria-orientation="horizontal"
          aria-label="${escapeHtml(t("chat.resizeHeight"))}"
        ></div>
      </div>
    </section>
  `;
}

function bindChatDrawerControls(
  host: HTMLElement,
  t: TranslateFn,
  options: ChatDrawerMountOptions,
  actions: ChatDrawerActions,
  helpers: {
    loadOlderMessages: () => Promise<void>;
    sendMessage: (text: string) => Promise<void>;
    switchChatLocale: (locale: EntityChatLocale) => void;
  }
): void {
  bindEntityChatLocaleSwitch(host, helpers.switchChatLocale);

  host.querySelector<HTMLButtonElement>("[data-chat-load-older]")?.addEventListener("click", () => {
    void helpers.loadOlderMessages();
  });

  host.querySelector<HTMLFormElement>("[data-chat-composer]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = host.querySelector<HTMLInputElement>("[data-chat-input]");
    const value = input?.value.trim() ?? "";

    if (!value) {
      return;
    }

    void helpers.sendMessage(value).then(() => {
      if (input) {
        input.value = "";
      }
    });
  });

  if (!options.isAuthenticated) {
    host.querySelector<HTMLInputElement>("[data-chat-input]")?.addEventListener("focus", () => {
      actions.onRequestSignIn();
    });
  }

  const drawer = host.querySelector<HTMLElement>(".chat-drawer");
  const resizeHandle = host.querySelector<HTMLElement>("[data-chat-resize-handle]");

  if (drawer && resizeHandle) {
    bindChatDrawerResizeHandle(drawer, resizeHandle, popupChatDrawerResizeConfig);
  }
}
