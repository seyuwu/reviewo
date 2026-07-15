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
import type {
  GamePartyChatMessageDto,
  GamePartyResponseDto
} from "../dto/game-party-response.dto.js";
import { GamePartiesService } from "../services/game-parties.service.js";

interface JoinPartyPayload {
  limit?: number;
  partySlug: string;
}

interface SendPartyMessagePayload {
  message: string;
  partySlug?: string;
}

interface PartySocketSession {
  partyId: string;
  partySlug: string;
  room: string;
}

interface AuthenticatedSocketData {
  partySession?: PartySocketSession;
  user: AuthenticatedUser | null;
}

@Injectable()
@WebSocketGateway({
  namespace: "/parties"
})
export class GamePartyGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly gamePartiesService: GamePartiesService,
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

    data.user = await this.usersService.findAuthenticatedUserById(verified.userId);
  }

  handleDisconnect(client: Socket): void {
    delete getSocketData(client).partySession;
  }

  @SubscribeMessage("join")
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinPartyPayload
  ): Promise<{
    messages: GamePartyChatMessageDto[];
    nextCursor: string | null;
    party: GamePartyResponseDto;
  }> {
    const currentUser = getSocketData(client).user;

    if (!currentUser) {
      throw createAppException({
        code: AppErrorCode.Unauthorized,
        message: "Authentication required",
        statusCode: HttpStatus.UNAUTHORIZED
      });
    }

    const partySlug = payload.partySlug?.trim();

    if (!partySlug) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "partySlug is required",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    const party = await this.gamePartiesService.getPartyBySlug(partySlug, currentUser.id);

    if (!party.isMember) {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "Only party members can join this chat",
        statusCode: HttpStatus.FORBIDDEN
      });
    }

    const previous = getSocketData(client).partySession;

    if (previous) {
      await client.leave(previous.room);
    }

    const room = partyRoomName(party.id);
    await client.join(room);
    getSocketData(client).partySession = {
      partyId: party.id,
      partySlug: party.slug,
      room
    };

    const page = await this.gamePartiesService.listChatMessages(
      party.slug,
      currentUser,
      undefined,
      payload.limit ?? 50
    );

    return {
      messages: page.messages,
      nextCursor: page.nextCursor,
      party
    };
  }

  @SubscribeMessage("leave")
  async handleLeave(@ConnectedSocket() client: Socket): Promise<{ ok: true } | null> {
    const session = getSocketData(client).partySession;

    if (!session) {
      return null;
    }

    await client.leave(session.room);
    delete getSocketData(client).partySession;
    return { ok: true };
  }

  @SubscribeMessage("send_message")
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SendPartyMessagePayload
  ): Promise<GamePartyChatMessageDto> {
    const currentUser = getSocketData(client).user;

    if (!currentUser) {
      throw createAppException({
        code: AppErrorCode.Unauthorized,
        message: "Authentication required",
        statusCode: HttpStatus.UNAUTHORIZED
      });
    }

    const session = getSocketData(client).partySession;
    const partySlug = payload.partySlug?.trim() || session?.partySlug;

    if (!partySlug) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "partySlug is required",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    const message = await this.gamePartiesService.sendChatMessage(
      partySlug,
      payload.message,
      currentUser
    );

    const party = await this.gamePartiesService.getPartyBySlug(partySlug, currentUser.id);
    this.broadcastNewMessage(party.id, message);
    return message;
  }

  broadcastNewMessage(partyId: string, message: GamePartyChatMessageDto): void {
    this.server.to(partyRoomName(partyId)).emit("new_message", message);
  }

  broadcastPartyUpdated(party: GamePartyResponseDto): void {
    this.server.to(partyRoomName(party.id)).emit("party_updated", party);
  }
}

export function partyRoomName(partyId: string): string {
  return `party:${partyId}`;
}

function extractHandshakeToken(client: Socket): string | null {
  const authToken = client.handshake.auth?.token;

  if (typeof authToken === "string" && authToken.trim()) {
    return authToken.trim();
  }

  const header = client.handshake.headers.authorization;

  if (typeof header === "string" && header.toLowerCase().startsWith("bearer ")) {
    return header.slice(7).trim();
  }

  return null;
}

function getSocketData(client: Socket): AuthenticatedSocketData {
  return client.data as AuthenticatedSocketData;
}
