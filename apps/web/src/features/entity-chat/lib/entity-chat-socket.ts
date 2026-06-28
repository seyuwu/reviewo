import { io, type Socket } from "socket.io-client";

import { publicEnv } from "../../../lib/config/public-env";
import type { EntityChatMessage } from "../types/entity-chat";

export interface EntityChatSocketHandlers {
  onMessages?: (messages: EntityChatMessage[]) => void;
  onNewMessage?: (message: EntityChatMessage) => void;
  onOnlineCount?: (onlineCount: number) => void;
  onDisconnect?: () => void;
}

export interface EntityChatSocketConnection {
  disconnect: () => void;
  isReady: () => boolean;
  sendMessage: (message: string) => Promise<EntityChatMessage>;
}

export type EntityChatSocketHandlersRef = {
  current: EntityChatSocketHandlers;
};

const SEND_MESSAGE_TIMEOUT_MS = 8000;
const JOIN_ROOM_TIMEOUT_MS = 10_000;

function readHandlers(handlersRef: EntityChatSocketHandlersRef): EntityChatSocketHandlers {
  return handlersRef.current;
}

function isJoinAck(
  response: unknown
): response is { messages: EntityChatMessage[]; onlineCount: number } {
  return (
    typeof response === "object" &&
    response !== null &&
    "messages" in response &&
    Array.isArray((response as { messages: unknown }).messages) &&
    "onlineCount" in response &&
    typeof (response as { onlineCount: unknown }).onlineCount === "number"
  );
}

export function connectEntityChatSocket(
  entityId: string,
  accessToken: string | null,
  handlersRef: EntityChatSocketHandlersRef
): EntityChatSocketConnection {
  let hasJoinedRoom = false;
  let joinTimeout: number | undefined;

  const clearJoinTimeout = (): void => {
    if (joinTimeout !== undefined) {
      window.clearTimeout(joinTimeout);
      joinTimeout = undefined;
    }
  };

  const joinRoom = (socket: Socket): void => {
    hasJoinedRoom = false;
    clearJoinTimeout();

    joinTimeout = window.setTimeout(() => {
      hasJoinedRoom = false;
      readHandlers(handlersRef).onDisconnect?.();
    }, JOIN_ROOM_TIMEOUT_MS);

    socket.emit("join", { entityId }, (response: unknown) => {
      clearJoinTimeout();

      if (!isJoinAck(response)) {
        hasJoinedRoom = false;
        readHandlers(handlersRef).onDisconnect?.();
        return;
      }

      hasJoinedRoom = true;
      readHandlers(handlersRef).onMessages?.(response.messages);
      readHandlers(handlersRef).onOnlineCount?.(response.onlineCount);
    });
  };

  const socket: Socket = io(`${publicEnv.apiBaseUrl}/chat`, {
    ...(accessToken ? { auth: { token: accessToken } } : {}),
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    transports: ["websocket", "polling"]
  });

  socket.on("connect", () => {
    joinRoom(socket);
  });

  socket.on("disconnect", () => {
    hasJoinedRoom = false;
    clearJoinTimeout();
    readHandlers(handlersRef).onDisconnect?.();
  });

  socket.on("connect_error", () => {
    hasJoinedRoom = false;
    readHandlers(handlersRef).onDisconnect?.();
  });

  socket.on("new_message", (message: EntityChatMessage) => {
    readHandlers(handlersRef).onNewMessage?.(message);
  });

  socket.on("online_count", (payload: { onlineCount: number }) => {
    readHandlers(handlersRef).onOnlineCount?.(payload.onlineCount);
  });

  const heartbeat = window.setInterval(() => {
    if (socket.connected && hasJoinedRoom) {
      socket.emit("heartbeat");
    }
  }, 30_000);

  return {
    disconnect: () => {
      window.clearInterval(heartbeat);
      clearJoinTimeout();
      hasJoinedRoom = false;

      if (socket.connected) {
        socket.emit("leave");
      }

      socket.off();
      socket.disconnect();
    },
    isReady: () => socket.connected && hasJoinedRoom,
    sendMessage: (message: string) =>
      new Promise((resolve, reject) => {
        if (!socket.connected || !hasJoinedRoom) {
          reject(new Error("Chat socket is not ready"));
          return;
        }

        const timeout = window.setTimeout(() => {
          reject(new Error("Chat send timed out"));
        }, SEND_MESSAGE_TIMEOUT_MS);

        socket.emit(
          "send_message",
          { entityId, message },
          (response: EntityChatMessage | { message?: string } | undefined) => {
            window.clearTimeout(timeout);

            if (response && "id" in response) {
              resolve(response);
              return;
            }

            reject(new Error("Could not send chat message"));
          }
        );
      })
  };
}
