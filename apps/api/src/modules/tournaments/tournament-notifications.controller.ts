import { Controller, Get, Header, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../common/interfaces/authenticated-request.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { TournamentDisputeNotificationsService } from "./tournament-dispute-notifications.service.js";
import { TournamentMatchChatService } from "./tournament-match-chat.service.js";

@Controller("dota/tournament-notifications")
@UseGuards(JwtAuthGuard)
export class TournamentNotificationsController {
  constructor(private readonly notifications: TournamentDisputeNotificationsService, private readonly chat: TournamentMatchChatService) {}
  @Get()
  @Header("Cache-Control", "private, no-store")
  async list(@CurrentUser() user: AuthenticatedUser) {
    const [disputes, mentions] = await Promise.all([this.notifications.list(user), this.chat.inbox(user)]);
    return { ...disputes, mentions: mentions.items, mentionCount: mentions.count };
  }
  @Post("mentions/:id/read")
  read(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.chat.readMention(id, user);
  }
}
