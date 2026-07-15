import { io, type Socket } from "socket.io-client";

import { publicEnv } from "../../../lib/config/public-env";
import type { GameParty, GamePartyChatMessage } from "../types/social";

export interface PartySocketHandlers {
  onDisconnect?: () => void;
  onMessages?: (messages: GamePartyChatMessage[], nextCursor?: string | null) => void;
  onNewMessage?: (message: GamePartyChatMessage) => void;
  onPartyUpdated?: (party: GameParty) => void;
}

export type PartySocketHandlersRef = {
  current: PartySocketHandlers;
};

export interface PartySocketConnection {
  disconnect: () => void;
  isReady: () => boolean;
  sendMessage: (message: string) => Promise<GamePartyChatMessage>;
}

const JOIN_ROOM_TIMEOUT_MS = 10_000;
const SEND_MESSAGE_TIMEOUT_MS = 8_000;

function readHandlers(handlersRef: PartySocketHandlersRef): PartySocketHandlers {
  return handlersRef.current;
}

function isJoinAck(
  response: unknown
): response is {
  messages: GamePartyChatMessage[];
  nextCursor?: string | null;
  party: GameParty;
} {
  return (
    typeof response === "object" &&
    response !== null &&
    "messages" in response &&
    Array.isArray((response as { messages: unknown }).messages) &&
    "party" in response &&
    typeof (response as { party: unknown }).party === "object"
  );
}

export function connectPartySocket(
  partySlug: string,
  accessToken: string,
  handlersRef: PartySocketHandlersRef
): PartySocketConnection {
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

    socket.emit("join", { limit: 50, partySlug }, (response: unknown) => {
      clearJoinTimeout();

      if (!isJoinAck(response)) {
        hasJoinedRoom = false;
        readHandlers(handlersRef).onDisconnect?.();
        return;
      }

      hasJoinedRoom = true;
      readHandlers(handlersRef).onPartyUpdated?.(response.party);
      readHandlers(handlersRef).onMessages?.(response.messages, response.nextCursor ?? null);
    });
  };

  const socket: Socket = io(`${publicEnv.apiBaseUrl}/parties`, {
    auth: { token: accessToken },
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
    clearJoinTimeout();
    readHandlers(handlersRef).onDisconnect?.();
  });

  socket.on("new_message", (message: GamePartyChatMessage) => {
    readHandlers(handlersRef).onNewMessage?.(message);
  });

  socket.on("party_updated", (party: GameParty) => {
    readHandlers(handlersRef).onPartyUpdated?.(party);
  });

  return {
    disconnect: () => {
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
          reject(new Error("Party chat socket is not ready"));
          return;
        }

        const timeout = window.setTimeout(() => {
          reject(new Error("Party chat send timed out"));
        }, SEND_MESSAGE_TIMEOUT_MS);

        socket.emit(
          "send_message",
          { message, partySlug },
          (response: GamePartyChatMessage | { message?: string } | undefined) => {
            window.clearTimeout(timeout);

            if (response && "id" in response) {
              resolve(response);
              return;
            }

            reject(new Error("Could not send party chat message"));
          }
        );
      })
  };
}
