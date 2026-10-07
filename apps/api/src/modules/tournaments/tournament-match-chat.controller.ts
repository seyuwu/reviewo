import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../common/interfaces/authenticated-request.js";
import { ApiRateLimiterService } from "../../common/rate-limiting/api-rate-limiter.service.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { TournamentMatchChatService } from "./tournament-match-chat.service.js";
import { TournamentMatchChatMessageDto } from "./dto/tournament-match-chat.dto.js";
import { TournamentRoomMessagesQueryDto } from "./dto/tournament-room.dto.js";

@Controller("dota/tournaments/:slug/matches/:matchId/chat")
@UseGuards(JwtAuthGuard)
export class TournamentMatchChatController {
  constructor(private readonly chat: TournamentMatchChatService, private readonly limiter: ApiRateLimiterService) {}
  @Get()
  @Header("Cache-Control", "private, no-store")
  list(@Param("slug") slug: string, @Param("matchId", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser, @Query() query: TournamentRoomMessagesQueryDto) {
    return this.chat.list(slug, id, user, query.before);
  }
  @Post()
  async send(@Param("slug") slug: string, @Param("matchId", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser, @Body() input: TournamentMatchChatMessageDto) {
    await this.limiter.assertWithinLimits([{
      key: user.id, namespace: "tournament:match-chat:send", limit: 20, windowSeconds: 60,
      message: "Too many chat messages"
    }]);
    return this.chat.send(slug, id, user, input.message, input.mentionUserIds);
  }
}
