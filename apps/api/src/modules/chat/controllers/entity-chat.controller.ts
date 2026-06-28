import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";

import { CurrentUser } from "../../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import {
  ApiRateLimiterService,
  type RequestLike
} from "../../../common/rate-limiting/api-rate-limiter.service.js";
import { createPresenceHeartbeatRateLimitRules } from "../../../common/rate-limiting/write-rate-limit-rules.js";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard.js";
import type {
  ActiveNowListDto,
  EntityChatMessageDto,
  EntityChatMessagesPageDto,
  EntityChatOnlineCountDto
} from "../dto/entity-chat.dto.js";
import {
  ActiveNowQueryDto,
  ListEntityChatMessagesQueryDto,
  SendEntityChatMessageDto
} from "../dto/entity-chat-query.dto.js";
import { EntityChatGateway } from "../gateways/entity-chat.gateway.js";
import { EntityChatService } from "../services/entity-chat.service.js";

@Controller("chat")
export class EntityChatController {
  constructor(
    private readonly apiRateLimiterService: ApiRateLimiterService,
    private readonly entityChatService: EntityChatService,
    private readonly entityChatGateway: EntityChatGateway
  ) {}

  @Get("entities/:entityId/messages")
  async listMessages(
    @Param("entityId", new ParseUUIDPipe({ version: "4" })) entityId: string,
    @Query() query: ListEntityChatMessagesQueryDto
  ): Promise<EntityChatMessagesPageDto> {
    return this.entityChatService.listMessages(entityId, query.before, query.limit);
  }

  @Get("entities/:entityId/online")
  async getOnlineCount(
    @Param("entityId", new ParseUUIDPipe({ version: "4" })) entityId: string
  ): Promise<EntityChatOnlineCountDto> {
    return this.entityChatService.getOnlineCount(entityId);
  }

  @Get("active-now")
  async getActiveNow(@Query() query: ActiveNowQueryDto): Promise<ActiveNowListDto> {
    return this.entityChatService.getActiveNow(query.limit ?? 5);
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
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike
  ): Promise<EntityChatOnlineCountDto> {
    await this.apiRateLimiterService.assertWithinLimits(
      createPresenceHeartbeatRateLimitRules(currentUser.id, request)
    );

    const onlineCount = await this.entityChatService.joinRoom(entityId, currentUser.id);

    return {
      entityId,
      onlineCount
    };
  }
}
