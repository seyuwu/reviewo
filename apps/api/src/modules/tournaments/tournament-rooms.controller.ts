import { Body, Controller, Delete, Get, Header, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../common/interfaces/authenticated-request.js";
import { ApiRateLimiterService, type RequestLike } from "../../common/rate-limiting/api-rate-limiter.service.js";
import { createSocialWriteRateLimitRules } from "../../common/rate-limiting/write-rate-limit-rules.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { OptionalJwtAuthGuard } from "../auth/guards/optional-jwt-auth.guard.js";
import { TournamentRoomMessageDto, TournamentRoomMessagesQueryDto, TournamentRoomVoiceDto } from "./dto/tournament-room.dto.js";
import { DotaTournamentRoomsService } from "./tournament-rooms.service.js";

@Controller("dota/tournaments")
export class DotaTournamentRoomsController {
  constructor(private readonly rooms: DotaTournamentRoomsService, private readonly limiter: ApiRateLimiterService) {}

  @Get("rooms/me")
  @Header("Cache-Control", "private, no-store")
  @UseGuards(JwtAuthGuard)
  listMine(@CurrentUser() user: AuthenticatedUser) { return this.rooms.listMine(user); }

  @Get(":slug/entries/:entryId/room")
  @Header("Cache-Control", "private, no-store")
  @UseGuards(OptionalJwtAuthGuard)
  get(@Param("slug") slug: string, @Param("entryId", ParseUUIDPipe) entryId: string,
    @CurrentUser() user?: AuthenticatedUser) {
    return this.rooms.get(slug, entryId, user);
  }

  @Get(":slug/entries/:entryId/messages")
  @Header("Cache-Control", "private, no-store")
  @UseGuards(JwtAuthGuard)
  messages(@Param("slug") slug: string, @Param("entryId", ParseUUIDPipe) entryId: string,
    @Query() query: TournamentRoomMessagesQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.rooms.listMessages(slug, entryId, user, query.before, query.limit);
  }

  @Post(":slug/entries/:entryId/messages")
  @UseGuards(JwtAuthGuard)
  async send(@Param("slug") slug: string, @Param("entryId", ParseUUIDPipe) entryId: string,
    @Body() input: TournamentRoomMessageDto, @CurrentUser() user: AuthenticatedUser) {
    await this.limiter.assertWithinLimits([{
      key: user.id, namespace: "tournament:chat:user", limit: 30, windowSeconds: 60,
      message: "Too many chat messages"
    }]);
    return this.rooms.sendMessage(slug, entryId, user, input.message);
  }

  @Post(":slug/entries/:entryId/discord-voice")
  @UseGuards(JwtAuthGuard)
  async voice(@Param("slug") slug: string, @Param("entryId", ParseUUIDPipe) entryId: string,
    @Body() input: TournamentRoomVoiceDto, @CurrentUser() user: AuthenticatedUser, @Req() request: RequestLike) {
    await this.limiter.assertWithinLimits(createSocialWriteRateLimitRules(user.id, request));
    return this.rooms.ensureVoice(slug, entryId, user, input.intent);
  }

  @Delete(":slug/entries/:entryId/room/members/me")
  @UseGuards(JwtAuthGuard)
  async leave(@Param("slug") slug: string, @Param("entryId", ParseUUIDPipe) entryId: string,
    @CurrentUser() user: AuthenticatedUser, @Req() request: RequestLike) {
    await this.limiter.assertWithinLimits(createSocialWriteRateLimitRules(user.id, request));
    return this.rooms.leaveAfterparty(slug, entryId, user);
  }
}
