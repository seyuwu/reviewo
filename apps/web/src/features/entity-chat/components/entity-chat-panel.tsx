"use client";

import { FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

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
  formatChatOnlineCountLabel,
  formatChatSendErrorMessage
} from "../lib/chat-ui-helpers";
import type { EntityChatMessage } from "../types/entity-chat";
import styles from "./entity-chat-panel.module.css";

const PANEL_ANIMATION_MS = 360;

interface EntityChatPanelProps {
  accessToken: string | null;
  entityId: string;
  entityTitle: string;
  isAuthenticated: boolean;
  onRequestSignIn?: () => void;
  placement?: "main" | "sidebar";
}

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

  const connectionRef = useRef<EntityChatSocketConnection | null>(null);
  const handlersRef = useRef<EntityChatSocketHandlers>({});
  const drawerRef = useRef<HTMLElement | null>(null);
  const resizeHandleRef = useRef<HTMLDivElement | null>(null);
  const messageListRef = useRef<HTMLUListElement | null>(null);
  const closeTimerRef = useRef<number | undefined>(undefined);
  const onlinePollRef = useRef<number | undefined>(undefined);
  const shouldStickToBottomRef = useRef(true);

  const entityTitleLabel = entityTitle.trim() || "Reviewo";

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
        ? await pingEntityChatPresence(entityId, accessToken)
        : await fetchEntityChatOnlineCount(entityId);

      setOnlineCount(result.onlineCount);
    } catch {
      // Keep the last known count visible.
    }
  }, [accessToken, entityId]);

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

    const scroll = (): void => {
      const lastMessage = list.lastElementChild;

      list.scrollTop = list.scrollHeight - list.clientHeight;

      if (lastMessage instanceof HTMLElement) {
        lastMessage.scrollIntoView({ block: "end", inline: "nearest" });
      }

      list.scrollTop = list.scrollHeight - list.clientHeight;
    };

    scroll();
    requestAnimationFrame(() => {
      scroll();
      requestAnimationFrame(scroll);
    });
    window.setTimeout(scroll, 80);
    window.setTimeout(scroll, 240);

    return true;
  }, []);

  handlersRef.current = {
    onMessages: (initialMessages) => {
      setMessages((current) => mergeChatMessages(current, initialMessages));
      shouldStickToBottomRef.current = true;
    },
    onNewMessage: (message) => {
      setMessages((current) => {
        if (current.some((item) => item.id === message.id)) {
          return current;
        }

        return [...current, message];
      });
      shouldStickToBottomRef.current = true;
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
      const page = await fetchEntityChatMessages(entityId, { limit: 100 });

      setMessages(page.messages);
      setNextCursor(page.nextCursor);
      setHasLoadedMessages(true);
      shouldStickToBottomRef.current = true;

      try {
        const online = await fetchEntityChatOnlineCount(entityId);
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
  }, [entityId, hasLoadedMessages, isBootstrapping, refreshOnlineCount, t]);

  const loadOlderMessages = useCallback(async (): Promise<void> => {
    if (!nextCursor || isLoadingOlder) {
      return;
    }

    setIsLoadingOlder(true);
    const list = messageListRef.current;
    const previousHeight = list?.scrollHeight ?? 0;

    try {
      const page = await fetchEntityChatMessages(entityId, {
        before: nextCursor,
        limit: 50
      });

      setMessages((current) => [...page.messages, ...current]);
      setNextCursor(page.nextCursor);

      requestAnimationFrame(() => {
        const updatedList = messageListRef.current;

        if (updatedList) {
          updatedList.scrollTop = updatedList.scrollHeight - previousHeight;
        }
      });
    } finally {
      setIsLoadingOlder(false);
    }
  }, [entityId, isLoadingOlder, nextCursor]);

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
        created = await sendEntityChatMessage(entityId, text, accessToken);
      }

      setMessages((current) => {
        if (current.some((item) => item.id === created!.id)) {
          return current;
        }

        return [...current, created!];
      });
      setDraft("");
      shouldStickToBottomRef.current = true;
    } catch (error) {
      setSendError(formatChatSendErrorMessage(t, error));
    } finally {
      setIsSending(false);
    }
  };

  useEffect(() => {
    if (!isSidebar || hasLoadedMessages || isBootstrapping) {
      return;
    }

    void bootstrapChat();
  }, [bootstrapChat, hasLoadedMessages, isBootstrapping, isSidebar]);

  useEffect(() => {
    setMessages([]);
    setNextCursor(null);
    setHasLoadedMessages(false);
    setSendError(null);
    disconnectSocket();
    stopOnlinePolling();
  }, [disconnectSocket, entityId, stopOnlinePolling]);

  const isChatLive = expanded || isSidebar;

  useEffect(() => {
    if (!hasLoadedMessages || !isChatLive) {
      return;
    }

    const connection = connectEntityChatSocket(entityId, accessToken, handlersRef);
    connectionRef.current = connection;
    startOnlinePolling();

    return () => {
      connection.disconnect();
      connectionRef.current = null;
      stopOnlinePolling();
    };
  }, [accessToken, entityId, hasLoadedMessages, isChatLive, startOnlinePolling, stopOnlinePolling]);

  useLayoutEffect(() => {
    if ((!expanded && !isSidebar) || isClosing) {
      return;
    }

    if (shouldStickToBottomRef.current) {
      scrollMessagesToBottom();
    }
  }, [expanded, isClosing, isSidebar, messages, scrollMessagesToBottom]);

  useEffect(() => {
    const drawer = drawerRef.current;
    const handle = resizeHandleRef.current;

    if ((!expanded && !isSidebar) || isClosing || isBootstrapping || !drawer || !handle) {
      return;
    }

    applyChatDrawerHeight(drawer, webChatDrawerResizeConfig);
    bindChatDrawerResizeHandle(drawer, handle, webChatDrawerResizeConfig);
  }, [expanded, isClosing, isBootstrapping, isSidebar]);

  useEffect(() => {
    if ((!expanded && !isSidebar) || isClosing || isBootstrapping) {
      return;
    }

    if (shouldStickToBottomRef.current) {
      shouldStickToBottomRef.current = !scrollMessagesToBottom();
    }
  }, [expanded, isClosing, isBootstrapping, isSidebar, messages.length, scrollMessagesToBottom]);

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
        {!isSidebar ? (
          <div className={styles.chatDrawerHeader}>
            <div>
              <h3>{t("chat.title")}</h3>
              <p className="muted-copy">{formatChatOnlineCountLabel(t, onlineCount)}</p>
            </div>
            <p className={`muted-copy ${styles.chatEntityTitle}`}>{entityTitleLabel}</p>
          </div>
        ) : null}

        <div className={styles.chatDrawerBody}>
          {messages.length === 0 ? (
            <p className={`muted-copy ${styles.chatEmptyCopy}`}>{t("chat.empty")}</p>
          ) : (
            <ul
              ref={messageListRef}
              className={styles.chatMessageList}
              onScroll={(event) => {
                const list = event.currentTarget;

                if (list.scrollTop <= 24) {
                  void loadOlderMessages();
                }
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

          <div
            ref={resizeHandleRef}
            className={styles.chatDrawerResizeHandle}
            role="separator"
            aria-orientation="horizontal"
            aria-label={t("chat.resizeHeight")}
          />
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
          <p className="result-type">{t("chat.title")}</p>
          <h2>{entityTitleLabel}</h2>
          <p className="muted-copy">{formatChatOnlineCountLabel(t, onlineCount)}</p>
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
