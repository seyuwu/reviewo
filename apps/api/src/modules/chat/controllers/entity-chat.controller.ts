import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";

import { CurrentUser } from "../../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard.js";
import type {
  ActiveNowListDto,
  EntityChatMessageDto,
  EntityChatMessagesPageDto,
  EntityChatOnlineCountDto
} from "../dto/entity-chat.dto.js";
import { SendEntityChatMessageDto } from "../dto/entity-chat-query.dto.js";
import { EntityChatGateway } from "../gateways/entity-chat.gateway.js";
import { EntityChatService } from "../services/entity-chat.service.js";

@Controller("chat")
export class EntityChatController {
  constructor(
    private readonly entityChatService: EntityChatService,
    private readonly entityChatGateway: EntityChatGateway
  ) {}

  @Get("entities/:entityId/messages")
  async listMessages(
    @Param("entityId", new ParseUUIDPipe({ version: "4" })) entityId: string,
    @Query("before") before?: string,
    @Query("limit") limit?: string
  ): Promise<EntityChatMessagesPageDto> {
    return this.entityChatService.listMessages(entityId, before, parseLimit(limit));
  }

  @Get("entities/:entityId/online")
  async getOnlineCount(
    @Param("entityId", new ParseUUIDPipe({ version: "4" })) entityId: string
  ): Promise<EntityChatOnlineCountDto> {
    return this.entityChatService.getOnlineCount(entityId);
  }

  @Get("active-now")
  async getActiveNow(@Query("limit") limit?: string): Promise<ActiveNowListDto> {
    return this.entityChatService.getActiveNow(parseLimit(limit) ?? 5);
  }

  @Post("entities/:entityId/messages")
  @UseGuards(JwtAuthGuard)
  async sendMessage(
    @Param("entityId", new ParseUUIDPipe({ version: "4" })) entityId: string,
    @Body() input: SendEntityChatMessageDto,
    @CurrentUser() currentUser: AuthenticatedUser
  ): Promise<EntityChatMessageDto> {
    const message = await this.entityChatService.sendMessage(entityId, input.message, currentUser);

    this.entityChatGateway.broadcastNewMessage(entityId, message);

    return message;
  }

  @Post("entities/:entityId/presence")
  @UseGuards(JwtAuthGuard)
  async heartbeatPresence(
    @Param("entityId", new ParseUUIDPipe({ version: "4" })) entityId: string,
    @CurrentUser() currentUser: AuthenticatedUser
  ): Promise<EntityChatOnlineCountDto> {
    const onlineCount = await this.entityChatService.joinRoom(entityId, currentUser.id);

    return {
      entityId,
      onlineCount
    };
  }
}

function parseLimit(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return undefined;
  }

  return parsed;
}
