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
import { buildEntityChatSocketRoomName, normalizeEntityChatLocale } from "@reviewo/shared";

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
import { EntityChatLocaleQueryDto } from "../dto/entity-chat-locale.dto.js";
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
    return this.entityChatService.listMessages(entityId, query.before, query.limit, query.locale);
  }

  @Get("entities/:entityId/online")
  async getOnlineCount(
    @Param("entityId", new ParseUUIDPipe({ version: "4" })) entityId: string,
    @Query() query: EntityChatLocaleQueryDto
  ): Promise<EntityChatOnlineCountDto> {
    return this.entityChatService.getOnlineCount(entityId, query.locale);
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
    const locale = normalizeEntityChatLocale(input.locale);
    const message = await this.entityChatService.sendMessage(
      entityId,
      input.message,
      currentUser,
      locale
    );

    this.entityChatGateway.broadcastNewMessage(
      {
        entityId,
        locale,
        room: buildEntityChatSocketRoomName(entityId, locale)
      },
      message
    );

    return message;
  }

  @Post("entities/:entityId/presence")
  @UseGuards(JwtAuthGuard)
  async heartbeatPresence(
    @Param("entityId", new ParseUUIDPipe({ version: "4" })) entityId: string,
    @Query() query: EntityChatLocaleQueryDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike
  ): Promise<EntityChatOnlineCountDto> {
    await this.apiRateLimiterService.assertWithinLimits(
      createPresenceHeartbeatRateLimitRules(currentUser.id, request)
    );

    const locale = normalizeEntityChatLocale(query.locale);
    const onlineCount = await this.entityChatService.joinRoom(entityId, currentUser.id, locale);

    return {
      entityId,
      locale,
      onlineCount
    };
  }
}
