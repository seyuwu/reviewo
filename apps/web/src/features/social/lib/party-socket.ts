import { io, type Socket } from "socket.io-client";

import { publicEnv } from "../../../lib/config/public-env";
import type { GameParty, GamePartyChatMessage } from "../types/social";

export interface PartyRecruitUpdated {
  looking: boolean;
  partyId?: string;
  partySlug: string;
  recruitedRoles: string[];
}

export interface PartySocketHandlers {
  onDisconnect?: () => void;
  onMessages?: (messages: GamePartyChatMessage[], nextCursor?: string | null) => void;
  onNewMessage?: (message: GamePartyChatMessage) => void;
  onPartyUpdated?: (party: GameParty) => void;
  onRecruitUpdated?: (payload: PartyRecruitUpdated) => void;
}

export type PartySocketHandlersRef = {
  current: PartySocketHandlers;
};

export interface PartySocketConnection {
  disconnect: () => void;
  ensureJoined: () => void;
  isReady: () => boolean;
  sendMessage: (message: string) => Promise<GamePartyChatMessage>;
}

export interface PartyWatchSocketConnection {
  disconnect: () => void;
}

const JOIN_ROOM_TIMEOUT_MS = 10_000;
const JOIN_RETRY_MS = 2_500;
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
  let joinInFlight = false;
  let joinTimeout: number | undefined;
  let joinRetryTimeout: number | undefined;
  let disposed = false;

  const clearJoinTimeout = (): void => {
    if (joinTimeout !== undefined) {
      window.clearTimeout(joinTimeout);
    }
    joinTimeout = undefined;
  };

  const clearJoinRetry = (): void => {
    if (joinRetryTimeout !== undefined) {
      window.clearTimeout(joinRetryTimeout);
    }
    joinRetryTimeout = undefined;
  };

  const scheduleJoinRetry = (socket: Socket): void => {
    if (disposed || hasJoinedRoom || joinRetryTimeout !== undefined) {
      return;
    }

    joinRetryTimeout = window.setTimeout(() => {
      joinRetryTimeout = undefined;
      if (!disposed && socket.connected && !hasJoinedRoom) {
        joinRoom(socket);
      }
    }, JOIN_RETRY_MS);
  };

  const joinRoom = (socket: Socket): void => {
    if (disposed || !socket.connected || joinInFlight) {
      return;
    }

    joinInFlight = true;
    hasJoinedRoom = false;
    clearJoinTimeout();
    clearJoinRetry();

    joinTimeout = window.setTimeout(() => {
      joinInFlight = false;
      hasJoinedRoom = false;
      readHandlers(handlersRef).onDisconnect?.();
      scheduleJoinRetry(socket);
    }, JOIN_ROOM_TIMEOUT_MS);

    socket.emit("join", { limit: 50, partySlug }, (response: unknown) => {
      clearJoinTimeout();
      joinInFlight = false;

      if (disposed) {
        return;
      }

      if (!isJoinAck(response)) {
        hasJoinedRoom = false;
        readHandlers(handlersRef).onDisconnect?.();
        scheduleJoinRetry(socket);
        return;
      }

      hasJoinedRoom = true;
      clearJoinRetry();
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
    joinInFlight = false;
    clearJoinTimeout();
    clearJoinRetry();
    readHandlers(handlersRef).onDisconnect?.();
  });

  socket.on("connect_error", () => {
    hasJoinedRoom = false;
    joinInFlight = false;
    clearJoinTimeout();
    readHandlers(handlersRef).onDisconnect?.();
    scheduleJoinRetry(socket);
  });

  socket.on("new_message", (message: GamePartyChatMessage) => {
    readHandlers(handlersRef).onNewMessage?.(message);
  });

  socket.on("party_updated", (party: GameParty) => {
    if (party?.slug === partySlug) {
      readHandlers(handlersRef).onPartyUpdated?.(party);
    }
  });

  socket.on("party_recruit_updated", (payload: PartyRecruitUpdated) => {
    if (payload?.partySlug === partySlug) {
      readHandlers(handlersRef).onRecruitUpdated?.(payload);
    }
  });

  return {
    disconnect: () => {
      disposed = true;
      clearJoinTimeout();
      clearJoinRetry();
      hasJoinedRoom = false;
      joinInFlight = false;

      if (socket.connected) {
        socket.emit("leave");
      }

      socket.off();
      socket.disconnect();
    },
    ensureJoined: () => {
      if (disposed || hasJoinedRoom) {
        return;
      }

      if (socket.connected) {
        joinRoom(socket);
        return;
      }

      socket.connect();
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

/** Lightweight public watch for roster + recruit updates (members use join for chat). */
export function connectPartyWatchSocket(
  partySlug: string,
  accessToken: string | null,
  handlers: {
    onConnected?: () => void;
    onPartyUpdated?: (party: GameParty) => void;
    onRecruitUpdated: (payload: PartyRecruitUpdated) => void;
  }
): PartyWatchSocketConnection {
  const socket: Socket = io(`${publicEnv.apiBaseUrl}/parties`, {
    ...(accessToken ? { auth: { token: accessToken } } : {}),
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    transports: ["websocket", "polling"]
  });

  const watch = (): void => {
    socket.emit("watch", { partySlug });
    handlers.onConnected?.();
  };

  socket.on("connect", watch);

  socket.on("party_updated", (party: GameParty) => {
    if (party?.slug === partySlug) {
      handlers.onPartyUpdated?.(party);
    }
  });

  socket.on("party_recruit_updated", (payload: PartyRecruitUpdated) => {
    if (payload?.partySlug === partySlug) {
      handlers.onRecruitUpdated(payload);
    }
  });

  return {
    disconnect: () => {
      if (socket.connected) {
        socket.emit("unwatch");
      }

      socket.off();
      socket.disconnect();
    }
  };
}
