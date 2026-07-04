"use client";

import { FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import type { EntityChatLocale } from "@reviewo/shared";
import {
  appendEntityChatMessageNewest,
  DEFAULT_ENTITY_CHAT_LOCALE,
  ENTITY_CHAT_CLIENT_INITIAL_LIMIT,
  ENTITY_CHAT_CLIENT_OLDER_LIMIT,
  mergeEntityChatMessagesNewest,
  prependEntityChatMessagesOldest,
  resolveEntityChatOlderCursor,
  trimEntityChatMessagesNewest
} from "@reviewo/shared";

import { useTranslation } from "../../i18n/locale-provider";
import {
  fetchEntityChatMessages,
  fetchEntityChatOnlineCount,
  pingEntityChatPresence,
  sendEntityChatMessage
} from "../api/entity-chat";
import {
  applyChatDrawerHeight,
  bindChatDrawerResizeHandle,
  webChatDrawerResizeConfig
} from "../lib/chat-drawer-resize";
import {
  connectEntityChatSocket,
  type EntityChatSocketConnection,
  type EntityChatSocketHandlers
} from "../lib/entity-chat-socket";
import {
  CHAT_ONLINE_POLL_MS,
  captureChatListScrollAnchor,
  formatChatOnlineCountLabel,
  formatChatSendErrorMessage,
  isChatListNearBottom,
  preserveChatListScrollPosition
} from "../lib/chat-ui-helpers";
import type { EntityChatMessage } from "../types/entity-chat";
import styles from "./entity-chat-panel.module.css";
import { EntityChatLocaleSwitch } from "./entity-chat-locale-switch";

const PANEL_ANIMATION_MS = 360;

interface EntityChatPanelProps {
  accessToken: string | null;
  entityId: string;
  entityTitle: string;
  isAuthenticated: boolean;
  onRequestSignIn?: () => void;
  placement?: "main" | "sidebar";
}

export function EntityChatPanel({
  accessToken,
  entityId,
  entityTitle,
  isAuthenticated,
  onRequestSignIn,
  placement = "main"
}: EntityChatPanelProps) {
  const t = useTranslation();
  const isSidebar = placement === "sidebar";
  const [expanded, setExpanded] = useState(isSidebar);
  const [isClosing, setIsClosing] = useState(false);
  const [messages, setMessages] = useState<EntityChatMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [onlineCount, setOnlineCount] = useState(0);
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [hasLoadedMessages, setHasLoadedMessages] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [draft, setDraft] = useState("");
  const [chatLocale, setChatLocale] = useState<EntityChatLocale>(DEFAULT_ENTITY_CHAT_LOCALE);

  const connectionRef = useRef<EntityChatSocketConnection | null>(null);
  const handlersRef = useRef<EntityChatSocketHandlers>({});
  const drawerRef = useRef<HTMLElement | null>(null);
  const resizeHandleRef = useRef<HTMLDivElement | null>(null);
  const messageListRef = useRef<HTMLUListElement | null>(null);
  const closeTimerRef = useRef<number | undefined>(undefined);
  const onlinePollRef = useRef<number | undefined>(undefined);
  const shouldStickToBottomRef = useRef(true);
  const olderScrollAnchorRef = useRef<ReturnType<typeof captureChatListScrollAnchor> | null>(null);

  const entityTitleLabel = entityTitle.trim() || t("brand.name");

  const disconnectSocket = useCallback((): void => {
    connectionRef.current?.disconnect();
    connectionRef.current = null;
  }, []);

  const stopOnlinePolling = useCallback((): void => {
    if (onlinePollRef.current !== undefined) {
      window.clearInterval(onlinePollRef.current);
      onlinePollRef.current = undefined;
    }
  }, []);

  const refreshOnlineCount = useCallback(async (): Promise<void> => {
    try {
      const result = accessToken
        ? await pingEntityChatPresence(entityId, accessToken, chatLocale)
        : await fetchEntityChatOnlineCount(entityId, chatLocale);

      setOnlineCount(result.onlineCount);
    } catch {
      // Keep the last known count visible.
    }
  }, [accessToken, chatLocale, entityId]);

  const startOnlinePolling = useCallback((): void => {
    stopOnlinePolling();

    const pollIfNeeded = (): void => {
      if (connectionRef.current?.isReady()) {
        return;
      }

      void refreshOnlineCount();
    };

    pollIfNeeded();
    onlinePollRef.current = window.setInterval(pollIfNeeded, CHAT_ONLINE_POLL_MS);
  }, [refreshOnlineCount, stopOnlinePolling]);

  const scrollMessagesToBottom = useCallback((): boolean => {
    const list = messageListRef.current;

    if (!list) {
      return false;
    }

    list.scrollTop = list.scrollHeight - list.clientHeight;
    return true;
  }, []);

  handlersRef.current = {
    onMessages: (initialMessages, incomingNextCursor) => {
      const list = messageListRef.current;

      if (list) {
        shouldStickToBottomRef.current = isChatListNearBottom(list);
      }

      setMessages((current) => {
        const merged = mergeEntityChatMessagesNewest(current, initialMessages);

        if (incomingNextCursor !== undefined) {
          setNextCursor((cursor) => resolveEntityChatOlderCursor(merged.length, incomingNextCursor, cursor));
        }

        return merged;
      });
    },
    onNewMessage: (message) => {
      const list = messageListRef.current;

      if (list) {
        shouldStickToBottomRef.current = isChatListNearBottom(list);
      }

      setMessages((current) => appendEntityChatMessageNewest(current, message));
    },
    onOnlineCount: (count) => {
      setOnlineCount(count);
      stopOnlinePolling();
    },
    onDisconnect: () => {
      startOnlinePolling();
    }
  };

  const bootstrapChat = useCallback(async (): Promise<void> => {
    if (hasLoadedMessages || isBootstrapping) {
      return;
    }

    setIsBootstrapping(true);

    try {
      const page = await fetchEntityChatMessages(entityId, {
        limit: ENTITY_CHAT_CLIENT_INITIAL_LIMIT,
        locale: chatLocale
      });

      setMessages(trimEntityChatMessagesNewest(page.messages));
      setNextCursor(page.nextCursor);
      setHasLoadedMessages(true);
      shouldStickToBottomRef.current = true;

      try {
        const online = await fetchEntityChatOnlineCount(entityId, chatLocale);
        setOnlineCount(online.onlineCount);
      } catch {
        setOnlineCount(0);
      }

      void refreshOnlineCount();
    } catch {
      setSendError(t("chat.loadError"));
    } finally {
      setIsBootstrapping(false);
    }
  }, [chatLocale, entityId, hasLoadedMessages, isBootstrapping, refreshOnlineCount, t]);

  const loadOlderMessages = useCallback(async (): Promise<void> => {
    if (!nextCursor || isLoadingOlder) {
      return;
    }

    setIsLoadingOlder(true);
    shouldStickToBottomRef.current = false;
    const list = messageListRef.current;

    if (list) {
      olderScrollAnchorRef.current = captureChatListScrollAnchor(list);
    }

    try {
      const page = await fetchEntityChatMessages(entityId, {
        before: nextCursor,
        limit: ENTITY_CHAT_CLIENT_OLDER_LIMIT,
        locale: chatLocale
      });

      setMessages((current) => prependEntityChatMessagesOldest(current, page.messages));
      setNextCursor(page.nextCursor);
    } finally {
      setIsLoadingOlder(false);
    }
  }, [chatLocale, entityId, isLoadingOlder, nextCursor]);

  const finishClose = useCallback((): void => {
    if (closeTimerRef.current !== undefined) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = undefined;
    }

    setIsClosing(false);
    setExpanded(false);
    disconnectSocket();
    stopOnlinePolling();
  }, [disconnectSocket, stopOnlinePolling]);

  const collapsePanel = useCallback((): void => {
    setIsClosing(true);

    closeTimerRef.current = window.setTimeout(() => {
      finishClose();
    }, PANEL_ANIMATION_MS + 80);
  }, [finishClose]);

  const expandPanel = useCallback((): void => {
    if (closeTimerRef.current !== undefined) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = undefined;
    }

    setIsClosing(false);
    setExpanded(true);
    shouldStickToBottomRef.current = true;
    startOnlinePolling();

    if (!hasLoadedMessages) {
      void bootstrapChat();
    }
  }, [bootstrapChat, hasLoadedMessages, startOnlinePolling]);

  const handleToggle = (): void => {
    if (expanded) {
      collapsePanel();
      return;
    }

    expandPanel();
  };

  const handleSend = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    const text = draft.trim();

    if (!text) {
      return;
    }

    if (!isAuthenticated || !accessToken) {
      onRequestSignIn?.();
      return;
    }

    setSendError(null);
    setIsSending(true);

    try {
      let created: EntityChatMessage | null = null;

      if (connectionRef.current?.isReady()) {
        try {
          created = await connectionRef.current.sendMessage(text);
        } catch {
          created = null;
        }
      }

      if (!created) {
        created = await sendEntityChatMessage(entityId, text, accessToken, chatLocale);
      }

      setMessages((current) => appendEntityChatMessageNewest(current, created!));
      setDraft("");
      shouldStickToBottomRef.current = true;
    } catch (error) {
      setSendError(formatChatSendErrorMessage(t, error));
    } finally {
      setIsSending(false);
    }
  };

  useEffect(() => {
    if ((!expanded && !isSidebar) || hasLoadedMessages || isBootstrapping) {
      return;
    }

    void bootstrapChat();
  }, [bootstrapChat, chatLocale, expanded, hasLoadedMessages, isBootstrapping, isSidebar]);

  const handleLocaleChange = useCallback(
    (nextLocale: EntityChatLocale): void => {
      if (nextLocale === chatLocale) {
        return;
      }

      disconnectSocket();
      stopOnlinePolling();
      setChatLocale(nextLocale);
      setMessages([]);
      setNextCursor(null);
      setHasLoadedMessages(false);
      setSendError(null);
      setDraft("");
      shouldStickToBottomRef.current = true;
    },
    [chatLocale, disconnectSocket, stopOnlinePolling]
  );

  useEffect(() => {
    setMessages([]);
    setNextCursor(null);
    setHasLoadedMessages(false);
    setSendError(null);
    setChatLocale(DEFAULT_ENTITY_CHAT_LOCALE);
    disconnectSocket();
    stopOnlinePolling();
  }, [disconnectSocket, entityId, stopOnlinePolling]);

  const isChatLive = expanded || isSidebar;

  useEffect(() => {
    if (!hasLoadedMessages || !isChatLive) {
      return;
    }

    const connection = connectEntityChatSocket(entityId, chatLocale, accessToken, handlersRef);
    connectionRef.current = connection;
    startOnlinePolling();

    return () => {
      connection.disconnect();
      connectionRef.current = null;
      stopOnlinePolling();
    };
  }, [accessToken, chatLocale, entityId, hasLoadedMessages, isChatLive, startOnlinePolling, stopOnlinePolling]);

  useLayoutEffect(() => {
    if ((!expanded && !isSidebar) || isClosing || isLoadingOlder) {
      return;
    }

    if (shouldStickToBottomRef.current) {
      scrollMessagesToBottom();
    }
  }, [expanded, isClosing, isLoadingOlder, isSidebar, messages, scrollMessagesToBottom]);

  useLayoutEffect(() => {
    const anchor = olderScrollAnchorRef.current;
    const list = messageListRef.current;

    if (!anchor || !list) {
      return;
    }

    preserveChatListScrollPosition(list, anchor);
    olderScrollAnchorRef.current = null;
  }, [messages]);

  useEffect(() => {
    if (isSidebar || (!expanded && !isSidebar) || isClosing || isBootstrapping) {
      return;
    }

    const drawer = drawerRef.current;
    const handle = resizeHandleRef.current;

    if (!drawer || !handle) {
      return;
    }

    applyChatDrawerHeight(drawer, webChatDrawerResizeConfig);
    bindChatDrawerResizeHandle(drawer, handle, webChatDrawerResizeConfig);
  }, [expanded, isClosing, isBootstrapping, isSidebar]);

  useEffect(
    () => () => {
      if (closeTimerRef.current !== undefined) {
        window.clearTimeout(closeTimerRef.current);
      }

      stopOnlinePolling();
      disconnectSocket();
    },
    [disconnectSocket, stopOnlinePolling]
  );

  const panelClassName = [
    styles.chatDrawerPanel,
    expanded || isSidebar ? styles.chatDrawerPanelOpen : "",
    isClosing ? styles.chatDrawerPanelClosing : "",
    isBootstrapping ? styles.chatDrawerPanelLoading : ""
  ]
    .filter(Boolean)
    .join(" ");

  const chatBody =
    isBootstrapping ? (
      <p className="muted-copy">{t("chat.loading")}</p>
    ) : sendError && !hasLoadedMessages ? (
      <p className={`status-copy-error ${styles.chatSendStatusError}`}>{sendError}</p>
    ) : (
      <section ref={drawerRef} className={styles.chatDrawer} aria-label={t("chat.title")}>
        <div className={styles.chatDrawerHeader}>
          <div className={styles.chatDrawerHeaderMain}>
            <div className={styles.chatDrawerHeaderTop}>
              <h3>{t("chat.title")}</h3>
              <div className={styles.chatDrawerHeaderTopCenter}>
                {messages.length > 0 ? (
                  <button
                    type="button"
                    className={styles.chatLoadOlderButton}
                    disabled={!nextCursor || isLoadingOlder}
                    onClick={() => {
                      void loadOlderMessages();
                    }}
                  >
                    {isLoadingOlder ? t("chat.loadingOlder") : t("chat.loadOlder")}
                  </button>
                ) : null}
              </div>
              <div className={styles.chatDrawerHeaderLocale}>
                <EntityChatLocaleSwitch locale={chatLocale} onChange={handleLocaleChange} />
              </div>
            </div>
            <p className="muted-copy">{formatChatOnlineCountLabel(t, onlineCount)}</p>
          </div>
          {!isSidebar ? (
            <p className={`muted-copy ${styles.chatEntityTitle}`}>{entityTitleLabel}</p>
          ) : null}
        </div>

        <div className={styles.chatDrawerBody}>
          {messages.length === 0 ? (
            <p className={`muted-copy ${styles.chatEmptyCopy}`}>{t("chat.empty")}</p>
          ) : (
            <ul
              ref={messageListRef}
              className={styles.chatMessageList}
              onScroll={(event) => {
                shouldStickToBottomRef.current = isChatListNearBottom(event.currentTarget);
              }}
            >
              {messages.map((message) => (
                <li className={styles.chatMessageItem} key={message.id}>
                  <strong>{message.displayName}:</strong>
                  <span>{message.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={styles.chatDrawerFooter}>
          <form className={styles.chatComposer} onSubmit={handleSend}>
            <input
              type="text"
              maxLength={2000}
              placeholder={t("chat.input.placeholder")}
              value={draft}
              disabled={!isAuthenticated || isSending}
              onChange={(event) => {
                setDraft(event.target.value);
              }}
              onFocus={() => {
                if (!isAuthenticated) {
                  onRequestSignIn?.();
                }
              }}
            />
            <button
              type="submit"
              className="secondary-button"
              disabled={!isAuthenticated || isSending || !draft.trim()}
            >
              {t("chat.send")}
            </button>
          </form>

          {isAuthenticated ? (
            sendError ? (
              <p className={`muted-copy ${styles.chatSendStatus} ${styles.chatSendStatusError}`}>
                {sendError}
              </p>
            ) : null
          ) : (
            <p className={`muted-copy ${styles.chatSignInHint}`}>{t("chat.signInRequired")}</p>
          )}

          {!isSidebar ? (
            <div
              ref={resizeHandleRef}
              className={styles.chatDrawerResizeHandle}
              role="separator"
              aria-orientation="horizontal"
              aria-label={t("chat.resizeHeight")}
            />
          ) : null}
        </div>
      </section>
    );

  return (
    <section
      className={`panel-card form-stack ${styles.chatSection}${
        isSidebar ? ` ${styles.chatSectionSidebar}` : ""
      }${expanded ? ` ${styles.chatSectionExpanded}` : ""}`}
      aria-label={t("chat.title")}
    >
      {isSidebar ? (
        <div className="section-heading">
          <h2>{entityTitleLabel}</h2>
        </div>
      ) : null}

      <div className={panelClassName} data-chat-drawer-panel>
        <div className={styles.chatDrawerPanelInner}>
          <div className={styles.chatDrawerHost}>{chatBody}</div>
        </div>
      </div>

      {isSidebar ? null : (
        <button
          type="button"
          className={styles.chatToggleButton}
          aria-expanded={expanded}
          onClick={handleToggle}
        >
          {expanded ? t("chat.toggle.close") : t("chat.toggle.open")}
        </button>
      )}
    </section>
  );
}
