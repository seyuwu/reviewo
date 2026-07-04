import { HttpStatus, Injectable } from "@nestjs/common";
import {
  buildEntityChatSocketRoomName,
  normalizeEntityChatLocale,
  type EntityChatLocale
} from "@reviewo/shared";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";

import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { createAppException } from "../../../common/exceptions/app.exception.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import { JwtTokenService } from "../../auth/services/jwt-token.service.js";
import { UsersService } from "../../users/services/users.service.js";
import type { EntityChatMessageDto } from "../dto/entity-chat.dto.js";
import { EntityChatService } from "../services/entity-chat.service.js";

interface JoinRoomPayload {
  entityId: string;
  locale?: EntityChatLocale;
  limit?: number;
}

interface SendMessagePayload {
  entityId: string;
  locale?: EntityChatLocale;
  message: string;
}

interface ChatSocketSession {
  entityId: string;
  locale: EntityChatLocale;
  room: string;
}

interface AuthenticatedSocketData {
  chatSession?: ChatSocketSession;
  user: AuthenticatedUser | null;
}

@Injectable()
@WebSocketGateway({
  namespace: "/chat"
})
export class EntityChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly entityChatService: EntityChatService,
    private readonly jwtTokenService: JwtTokenService,
    private readonly usersService: UsersService
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const token = extractHandshakeToken(client);
    const data = getSocketData(client);

    if (!token) {
      data.user = null;
      return;
    }

    const verified = this.jwtTokenService.verifyAccessToken(token);

    if (!verified) {
      data.user = null;
      return;
    }

    const user = await this.usersService.findAuthenticatedUserById(verified.userId);
    data.user = user;
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const session = getSocketData(client).chatSession;
    const userId = getSocketData(client).user?.id;

    if (!session) {
      return;
    }

    if (userId) {
      await this.entityChatService.leaveRoom(session.entityId, userId, session.locale);
    }

    this.emitRoomOnlineCount(session);
    delete getSocketData(client).chatSession;
  }

  @SubscribeMessage("join")
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinRoomPayload
  ): Promise<{
    entityId: string;
    locale: EntityChatLocale;
    messages: EntityChatMessageDto[];
    nextCursor: string | null;
    onlineCount: number;
  }> {
    const entityId = payload.entityId;
    const locale = normalizeEntityChatLocale(payload.locale);

    if (!entityId) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "entityId is required",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    const session = buildChatSession(entityId, locale);
    const previousSession = getSocketData(client).chatSession;
    const userId = getSocketData(client).user?.id;

    if (previousSession && previousSession.room !== session.room) {
      if (userId) {
        await this.entityChatService.leaveRoom(
          previousSession.entityId,
          userId,
          previousSession.locale
        );
      }

      await client.leave(previousSession.room);
      this.emitRoomOnlineCount(previousSession);
    }

    await client.join(session.room);
    getSocketData(client).chatSession = session;

    const page = await this.entityChatService.listMessages(
      entityId,
      undefined,
      payload.limit,
      locale
    );

    if (userId) {
      await this.entityChatService.joinRoom(entityId, userId, locale);
    }

    const onlineCount = this.emitRoomOnlineCount(session);

    return {
      entityId,
      locale,
      messages: page.messages,
      nextCursor: page.nextCursor,
      onlineCount
    };
  }

  @SubscribeMessage("leave")
  async handleLeave(
    @ConnectedSocket() client: Socket
  ): Promise<{ entityId: string; locale: EntityChatLocale; onlineCount: number } | null> {
    const session = getSocketData(client).chatSession;
    const userId = getSocketData(client).user?.id;

    if (!session) {
      return null;
    }

    await client.leave(session.room);
    delete getSocketData(client).chatSession;

    if (userId) {
      await this.entityChatService.leaveRoom(session.entityId, userId, session.locale);
    }

    const onlineCount = this.emitRoomOnlineCount(session);

    return {
      entityId: session.entityId,
      locale: session.locale,
      onlineCount
    };
  }

  @SubscribeMessage("send_message")
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SendMessagePayload
  ): Promise<EntityChatMessageDto> {
    const currentUser = getSocketData(client).user;

    if (!currentUser) {
      throw createAppException({
        code: AppErrorCode.Unauthorized,
        message: "Authentication required",
        statusCode: HttpStatus.UNAUTHORIZED
      });
    }

    const session = getSocketData(client).chatSession;
    const locale = normalizeEntityChatLocale(payload.locale ?? session?.locale);
    const message = await this.entityChatService.sendMessage(
      payload.entityId,
      payload.message,
      currentUser,
      locale
    );

    this.broadcastNewMessage(buildChatSession(payload.entityId, locale), message);

    return message;
  }

  broadcastNewMessage(session: ChatSocketSession, message: EntityChatMessageDto): void {
    this.server.to(session.room).emit("new_message", message);
  }

  @SubscribeMessage("heartbeat")
  async handleHeartbeat(@ConnectedSocket() client: Socket): Promise<{ onlineCount: number } | null> {
    const session = getSocketData(client).chatSession;
    const userId = getSocketData(client).user?.id;

    if (!session || !userId) {
      return null;
    }

    await this.entityChatService.joinRoom(session.entityId, userId, session.locale);
    const onlineCount = this.emitRoomOnlineCount(session);

    return { onlineCount };
  }

  private emitRoomOnlineCount(session: ChatSocketSession): number {
    const onlineCount = this.readRoomOnlineCount(session.room);

    this.server.to(session.room).emit("online_count", {
      entityId: session.entityId,
      locale: session.locale,
      onlineCount
    });

    return onlineCount;
  }

  private readRoomOnlineCount(room: string): number {
    return readSocketRooms(this.server).get(room)?.size ?? 0;
  }
}

export function roomName(entityId: string, locale: EntityChatLocale = "ru"): string {
  return buildEntityChatSocketRoomName(entityId, locale);
}

function buildChatSession(entityId: string, locale: EntityChatLocale): ChatSocketSession {
  return {
    entityId,
    locale,
    room: roomName(entityId, locale)
  };
}

function extractHandshakeToken(client: Socket): string | null {
  const authToken = client.handshake.auth?.token;

  if (typeof authToken === "string" && authToken.length > 0) {
    return authToken;
  }

  const authorization = client.handshake.headers.authorization;

  if (typeof authorization !== "string") {
    return null;
  }

  const [scheme, token] = authorization.split(" ");

  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token;
}

function getSocketData(client: Socket): AuthenticatedSocketData {
  if (!client.data.user) {
    client.data.user = null;
  }

  return client.data as AuthenticatedSocketData;
}

function readSocketRooms(server: Server): Map<string, Set<unknown>> {
  const gatewayServer = server as unknown as {
    adapter?: { rooms: Map<string, Set<unknown>> };
    sockets?: { adapter?: { rooms: Map<string, Set<unknown>> } };
  };

  return gatewayServer.adapter?.rooms ?? gatewayServer.sockets?.adapter?.rooms ?? new Map();
}
