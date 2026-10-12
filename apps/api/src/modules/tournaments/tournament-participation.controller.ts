import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../common/interfaces/authenticated-request.js";
import { ApiRateLimiterService, type RequestLike } from "../../common/rate-limiting/api-rate-limiter.service.js";
import { createSocialWriteRateLimitRules } from "../../common/rate-limiting/write-rate-limit-rules.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { OptionalJwtAuthGuard } from "../auth/guards/optional-jwt-auth.guard.js";
import { TournamentTelegramLinkedGuard } from "./tournament-telegram-linked.guard.js";
import { StartTournamentSoloSearchDto } from "./dto/tournament-participation.dto.js";
import { TournamentParticipationService } from "./tournament-participation.service.js";
import { DotaTournamentsService } from "./tournaments.service.js";

@Controller("dota/tournaments")
export class DotaTournamentsPreviewController {
  constructor(private readonly tournaments: DotaTournamentsService, private readonly participation: TournamentParticipationService) {}
  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  list() { return this.tournaments.listPublic(); }
  @Get("entry-links/:id")
  link(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string) { return this.participation.entryLink(id); }
  @Get(":slug")
  @UseGuards(OptionalJwtAuthGuard)
  get(@Param("slug") slug: string, @CurrentUser() user?: AuthenticatedUser) { return this.tournaments.getPublic(slug, user); }
}

@Controller("dota/tournaments")
@UseGuards(JwtAuthGuard, TournamentTelegramLinkedGuard)
export class TournamentParticipationController {
  constructor(private readonly participation: TournamentParticipationService, private readonly rateLimiter: ApiRateLimiterService) {}
  @Get(":slug/participation")
  @Header("Cache-Control", "private, no-store")
  state(@Param("slug") slug: string, @CurrentUser() user: AuthenticatedUser) { return this.participation.state(slug, user); }
  @Post(":slug/participation/solo")
  async start(@Param("slug") slug: string, @Body() input: StartTournamentSoloSearchDto,
    @CurrentUser() user: AuthenticatedUser, @Req() request: RequestLike) {
    await this.rateLimiter.assertWithinLimits(createSocialWriteRateLimitRules(user.id, request));
    return this.participation.start(slug, input, user);
  }
  @Post(":slug/participation/cancel")
  async cancel(@Param("slug") slug: string, @CurrentUser() user: AuthenticatedUser, @Req() request: RequestLike) {
    await this.rateLimiter.assertWithinLimits(createSocialWriteRateLimitRules(user.id, request));
    return this.participation.cancel(slug, user);
  }
  @Post(":slug/participation/requests/:requestId/cancel")
  async cancelRequest(@Param("slug") slug: string, @Param("requestId", new ParseUUIDPipe({ version: "4" })) requestId: string,
    @CurrentUser() user: AuthenticatedUser, @Req() request: RequestLike) {
    await this.rateLimiter.assertWithinLimits(createSocialWriteRateLimitRules(user.id, request));
    return this.participation.cancelRequest(slug, requestId, user);
  }
}
