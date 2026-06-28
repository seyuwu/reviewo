import { HttpStatus, Injectable } from "@nestjs/common";
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
}

interface SendMessagePayload {
  entityId: string;
  message: string;
}

interface AuthenticatedSocketData {
  user: AuthenticatedUser | null;
}

@Injectable()
@WebSocketGateway({
  cors: {
    origin: true
  },
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
    const entityId = client.data.entityId as string | undefined;
    const userId = getSocketData(client).user?.id;

    if (!entityId || !userId) {
      return;
    }

    const onlineCount = await this.entityChatService.leaveRoom(entityId, userId);
    this.server.to(roomName(entityId)).emit("online_count", {
      entityId,
      onlineCount
    });
  }

  @SubscribeMessage("join")
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinRoomPayload
  ): Promise<{ entityId: string; messages: EntityChatMessageDto[]; onlineCount: number }> {
    const entityId = payload.entityId;

    if (!entityId) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "entityId is required",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    const previousEntityId = client.data.entityId as string | undefined;
    const userId = getSocketData(client).user?.id;

    if (previousEntityId && previousEntityId !== entityId && userId) {
      const previousOnlineCount = await this.entityChatService.leaveRoom(previousEntityId, userId);
      this.server.to(roomName(previousEntityId)).emit("online_count", {
        entityId: previousEntityId,
        onlineCount: previousOnlineCount
      });
      await client.leave(roomName(previousEntityId));
    }

    await client.join(roomName(entityId));
    client.data.entityId = entityId;

    const page = await this.entityChatService.listMessages(entityId);
    let onlineCount = await this.entityChatService.getOnlineCount(entityId).then((result) => result.onlineCount);

    if (userId) {
      onlineCount = await this.entityChatService.joinRoom(entityId, userId);
    }

    this.server.to(roomName(entityId)).emit("online_count", {
      entityId,
      onlineCount
    });

    return {
      entityId,
      messages: page.messages,
      onlineCount
    };
  }

  @SubscribeMessage("leave")
  async handleLeave(@ConnectedSocket() client: Socket): Promise<{ entityId: string; onlineCount: number } | null> {
    const entityId = client.data.entityId as string | undefined;
    const userId = getSocketData(client).user?.id;

    if (!entityId) {
      return null;
    }

    await client.leave(roomName(entityId));
    delete client.data.entityId;

    let onlineCount = await this.entityChatService.getOnlineCount(entityId).then((result) => result.onlineCount);

    if (userId) {
      onlineCount = await this.entityChatService.leaveRoom(entityId, userId);
    }

    this.server.to(roomName(entityId)).emit("online_count", {
      entityId,
      onlineCount
    });

    return {
      entityId,
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

    const message = await this.entityChatService.sendMessage(payload.entityId, payload.message, currentUser);

    this.broadcastNewMessage(payload.entityId, message);

    return message;
  }

  broadcastNewMessage(entityId: string, message: EntityChatMessageDto): void {
    this.server.to(roomName(entityId)).emit("new_message", message);
  }

  @SubscribeMessage("heartbeat")
  async handleHeartbeat(@ConnectedSocket() client: Socket): Promise<{ onlineCount: number } | null> {
    const entityId = client.data.entityId as string | undefined;
    const userId = getSocketData(client).user?.id;

    if (!entityId || !userId) {
      return null;
    }

    const onlineCount = await this.entityChatService.joinRoom(entityId, userId);

    return { onlineCount };
  }
}

export function roomName(entityId: string): string {
  return `entity:${entityId}`;
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
