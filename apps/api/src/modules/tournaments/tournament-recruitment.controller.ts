import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../common/interfaces/authenticated-request.js";
import { ApiRateLimiterService, type RequestLike } from "../../common/rate-limiting/api-rate-limiter.service.js";
import { createSocialWriteRateLimitRules } from "../../common/rate-limiting/write-rate-limit-rules.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { TournamentTelegramLinkedGuard } from "./tournament-telegram-linked.guard.js";
import { TournamentRecruitmentService } from "./tournament-recruitment.service.js";
import { TournamentRecruitInviteDto, TournamentRecruitQueryDto, TournamentRecruitSearchDto } from "./dto/tournament-participation.dto.js";
import { JoinDotaTournamentEntryDto } from "./dto/join-dota-tournament-entry.dto.js";

@Controller("dota/tournaments")
@UseGuards(JwtAuthGuard, TournamentTelegramLinkedGuard)
export class TournamentRecruitmentController {
  constructor(private readonly recruitment: TournamentRecruitmentService, private readonly limiter: ApiRateLimiterService) {}
  @Get(":slug/entries/:entryId/recruitment")
  @Header("Cache-Control", "private, no-store")
  board(@Param("slug") slug: string, @Param("entryId", new ParseUUIDPipe({ version: "4" })) entryId: string,
    @Query() input: TournamentRecruitQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.recruitment.board(slug, entryId, user, input.notice);
  }
  @Post(":slug/entries/:entryId/recruitment/search")
  async search(@Param("slug") slug: string, @Param("entryId", new ParseUUIDPipe({ version: "4" })) entryId: string,
    @Body() input: TournamentRecruitSearchDto, @CurrentUser() user: AuthenticatedUser, @Req() request: RequestLike) {
    await this.limiter.assertWithinLimits(createSocialWriteRateLimitRules(user.id, request));
    return this.recruitment.setSearching(slug, entryId, input.enabled, user);
  }
  @Post(":slug/entries/:entryId/recruitment/invite")
  async invite(@Param("slug") slug: string, @Param("entryId", new ParseUUIDPipe({ version: "4" })) entryId: string,
    @Body() input: TournamentRecruitInviteDto, @CurrentUser() user: AuthenticatedUser, @Req() request: RequestLike) {
    await this.limiter.assertWithinLimits(createSocialWriteRateLimitRules(user.id, request));
    return this.recruitment.invite(slug, entryId, input, user);
  }
  @Get(":slug/participation/invites/:noticeId")
  @Header("Cache-Control", "private, no-store")
  invitation(@Param("slug") slug: string, @Param("noticeId", new ParseUUIDPipe({ version: "4" })) noticeId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.recruitment.invitation(slug, noticeId, user);
  }
  @Post(":slug/participation/invites/:noticeId/accept")
  async accept(@Param("slug") slug: string, @Param("noticeId", new ParseUUIDPipe({ version: "4" })) noticeId: string,
    @Body() input: JoinDotaTournamentEntryDto, @CurrentUser() user: AuthenticatedUser, @Req() request: RequestLike) {
    await this.limiter.assertWithinLimits(createSocialWriteRateLimitRules(user.id, request));
    return this.recruitment.accept(slug, noticeId, input.positionRole, user);
  }
}
