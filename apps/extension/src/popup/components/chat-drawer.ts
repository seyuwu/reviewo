import type { TranslateFn } from "@reviewo/i18n";

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
  isAuthenticated: boolean;
}

const expandedStateByEntity = new Map<string, boolean>();
const liveConnectionByEntity = new Map<string, ReturnType<typeof connectEntityChatSocket>>();
const POPUP_CHAT_PANEL_ANIMATION_MS = 360;
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

export function setPopupChatExpanded(expanded: boolean): void {
  document.documentElement.classList.toggle("popup-chat-expanded", expanded);
  document.body.classList.toggle("popup-chat-expanded", expanded);
  document.querySelector<HTMLElement>(".popup-body")?.classList.toggle("popup-chat-expanded", expanded);
  document.querySelector<HTMLElement>(".screen-host")?.classList.toggle("popup-chat-expanded", expanded);

  if (expanded) {
    requestAnimationFrame(() => {
      const chatDock = document.querySelector<HTMLElement>(".entity-chat-actions, .home-chat-actions");

      chatDock?.scrollIntoView({ block: "nearest" });
    });
  }
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

  liveConnectionByEntity.get(entityId)?.disconnect();
  liveConnectionByEntity.delete(entityId);

  let connection: ReturnType<typeof connectEntityChatSocket> | null = null;
  let messages: EntityChatMessage[] = [];
  let nextCursor: string | null = null;
  let onlineCount = 0;
  let isLoadingOlder = false;
  let hasLoadedMessages = false;
  let isBootstrapping = false;
  let onlinePollTimer: number | undefined;
  let messageSyncTimer: number | undefined;
  let isSyncingMessages = false;
  let closeLayoutTimer: number | undefined;

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
        ? await pingEntityChatPresence(entityId, options.accessToken)
        : await fetchEntityChatOnlineCount(entityId);

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
      const page = await fetchEntityChatMessages(entityId, { limit: 100 });
      const mergedMessages = mergeChatMessages(messages, page.messages);

      if (mergedMessages !== messages) {
        messages = mergedMessages;
        nextCursor ??= page.nextCursor;
        renderDrawerContent();
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

    connection = connectEntityChatSocket(entityId, options.accessToken, {
      onMessages: (initialMessages) => {
        messages = initialMessages;
        renderDrawerContent();
      },
      onNewMessage: (message) => {
        if (messages.some((item) => item.id === message.id)) {
          return;
        }

        messages = [...messages, message];
        renderDrawerContent();
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
    liveConnectionByEntity.set(entityId, connection);
  };

  const renderDrawerContent = (): void => {
    if (!host) {
      return;
    }

    host.innerHTML = renderChatDrawerMarkup(t, entityTitleLabel(options.entityTitle, t), onlineCount, messages, {
      isAuthenticated: options.isAuthenticated
    });
    bindChatDrawerControls(host, t, options, actions, {
      getMessages: () => messages,
      loadOlderMessages,
      sendMessage
    });
    syncDrawerHeight();
    scrollMessagesToBottom(host.querySelector<HTMLElement>("[data-chat-message-list]"));
  };

  const syncDrawerHeight = (): void => {
    const drawer = host.querySelector<HTMLElement>(".chat-drawer");

    if (!drawer) {
      const fallback = Math.min(
        readStoredChatDrawerHeight(popupChatDrawerResizeConfig),
        popupChatDrawerResizeConfig.getMaxHeightPx()
      );
      chatPanel.style.setProperty("--reviewo-chat-panel-max-height", `${fallback}px`);
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
    liveConnectionByEntity.delete(entityId);
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
    liveConnectionByEntity.delete(entityId);
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
    startOnlinePolling();

    if (!hasLoadedMessages) {
      void bootstrapChat();
    } else {
      connectLiveUpdates();
      startMessageSync();
      renderDrawerContent();
    }
  }

  async function bootstrapChat(): Promise<void> {
    if (!host || isBootstrapping || hasLoadedMessages) {
      return;
    }

    isBootstrapping = true;
    chatPanel.classList.add("is-loading");
    host.innerHTML = `<p class="muted-copy">${escapeHtml(t("chat.loading"))}</p>`;

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
      renderDrawerContent();
      updateOnlineCountUi();
      connectLiveUpdates();
      startMessageSync();
      void refreshOnlineCount();
    } catch {
      if (host) {
        host.innerHTML = `<p class="status-copy-error">${escapeHtml(t("chat.loadError"))}</p>`;
      }
    } finally {
      chatPanel.classList.remove("is-loading");
      isBootstrapping = false;
    }
  }

  async function loadOlderMessages(): Promise<void> {
    if (!nextCursor || isLoadingOlder || !host) {
      return;
    }

    isLoadingOlder = true;
    const list = host.querySelector<HTMLElement>("[data-chat-message-list]");
    const previousHeight = list?.scrollHeight ?? 0;

    try {
      const page = await fetchEntityChatMessages(entityId, {
        before: nextCursor,
        limit: 50
      });

      messages = [...page.messages, ...messages];
      nextCursor = page.nextCursor;
      renderDrawerContent();

      const updatedList = host.querySelector<HTMLElement>("[data-chat-message-list]");

      if (updatedList) {
        updatedList.scrollTop = updatedList.scrollHeight - previousHeight;
      }
    } finally {
      isLoadingOlder = false;
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
        created = await sendEntityChatMessage(entityId, text, options.accessToken);
      }

      if (!messages.some((item) => item.id === created.id)) {
        messages = [...messages, created];
        renderDrawerContent();
      }

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
  entityTitle: string,
  onlineCount: number,
  messages: EntityChatMessage[],
  options: { isAuthenticated: boolean }
): string {
  const messageMarkup =
    messages.length === 0
      ? `<p class="muted-copy chat-empty-copy">${escapeHtml(t("chat.empty"))}</p>`
      : `<ul class="chat-message-list" data-chat-message-list>
          ${messages
            .map(
              (message) => `
            <li class="chat-message-item">
              <strong>${escapeHtml(message.displayName)}:</strong>
              <span>${escapeHtml(message.message)}</span>
            </li>
          `
            )
            .join("")}
        </ul>`;

  return `
    <section class="chat-drawer" aria-label="${escapeHtml(t("chat.title"))}">
      <div class="chat-drawer-header">
        <div>
          <h3>${escapeHtml(t("chat.title"))}</h3>
          <p class="muted-copy" data-chat-online-count>${escapeHtml(
            formatChatOnlineCountLabel(t, onlineCount)
          )}</p>
        </div>
        <p class="muted-copy chat-entity-title">${escapeHtml(entityTitle)}</p>
      </div>
      <div class="chat-drawer-body">
        ${messageMarkup}
      </div>
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
    getMessages: () => EntityChatMessage[];
    loadOlderMessages: () => Promise<void>;
    sendMessage: (text: string) => Promise<void>;
  }
): void {
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

  host.querySelector<HTMLElement>("[data-chat-message-list]")?.addEventListener("scroll", (event) => {
    const list = event.currentTarget as HTMLElement;

    if (list.scrollTop <= 24) {
      void helpers.loadOlderMessages();
    }
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

function entityTitleLabel(title: string, t: TranslateFn): string {
  return title.trim() || t("brand.name");
}

function scrollMessagesToBottom(list: HTMLElement | null): void {
  if (!list) {
    return;
  }

  requestAnimationFrame(() => {
    list.scrollTop = list.scrollHeight;
  });
}
