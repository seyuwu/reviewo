import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../common/interfaces/authenticated-request.js";
import { ApiRateLimiterService, type RequestLike } from "../../common/rate-limiting/api-rate-limiter.service.js";
import { createSocialWriteRateLimitRules } from "../../common/rate-limiting/write-rate-limit-rules.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { OptionalJwtAuthGuard } from "../auth/guards/optional-jwt-auth.guard.js";
import { TournamentTelegramLinkedGuard } from "./tournament-telegram-linked.guard.js";
import {
  StartTournamentSoloSearchDto,
  TournamentApplicationDecisionDto,
  TournamentApplicationNotificationsDto,
  TournamentApplicationPageDto,
  TournamentCompanyConsentDto,
  TournamentTeamPageDto
} from "./dto/tournament-participation.dto.js";
import { TournamentParticipationService } from "./tournament-participation.service.js";
import { DotaTournamentsService } from "./tournaments.service.js";
import { DecideDotaTournamentEntryRequestDto } from "./dto/join-dota-tournament-entry.dto.js";

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
  state(@Param("slug") slug: string, @CurrentUser() user: AuthenticatedUser) {
    return this.participation.state(slug, user);
  }
  @Get(":slug/participation/teams")
  @Header("Cache-Control", "private, no-store")
  teams(
    @Param("slug") slug: string,
    @Query() input: TournamentTeamPageDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.participation.teams(slug, user, input.page ?? 0);
  }
  @Post(":slug/participation/company")
  async company(
    @Param("slug") slug: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: RequestLike
  ) {
    await this.rateLimiter.assertWithinLimits(createSocialWriteRateLimitRules(user.id, request));
    return this.participation.enableCompany(slug, user);
  }
  @Post(":slug/participation/company/confirm")
  async confirmCompany(
    @Param("slug") slug: string,
    @Body() input: TournamentCompanyConsentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: RequestLike
  ) {
    await this.rateLimiter.assertWithinLimits(createSocialWriteRateLimitRules(user.id, request));
    return this.participation.confirmCompany(
      slug,
      input.rosterVersion,
      user,
      input.confirmed ?? true
    );
  }
  @Get(":slug/participation/company/teams")
  @Header("Cache-Control", "private, no-store")
  companyTeams(
    @Param("slug") slug: string,
    @Query() input: TournamentTeamPageDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.participation.companyTeams(slug, user, input.page ?? 0);
  }
  @Post(":slug/participation/company/applications/:entryId")
  async applyCompany(
    @Param("slug") slug: string,
    @Param("entryId", new ParseUUIDPipe({ version: "4" })) entryId: string,
    @Body() input: TournamentCompanyConsentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: RequestLike
  ) {
    await this.rateLimiter.assertWithinLimits(createSocialWriteRateLimitRules(user.id, request));
    return this.participation.applyCompany(slug, entryId, input.rosterVersion, user);
  }
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
  @Get(":slug/participation/applications/:noticeId")
  @Header("Cache-Control", "private, no-store")
  application(@Param("slug") slug: string, @Param("noticeId", new ParseUUIDPipe({ version: "4" })) noticeId: string,
    @CurrentUser() user: AuthenticatedUser) { return this.participation.application(slug, noticeId, user); }
  @Get(":slug/participation/applications")
  @Header("Cache-Control", "private, no-store")
  applications(@Param("slug") slug: string, @Query() input: TournamentApplicationPageDto, @CurrentUser() user: AuthenticatedUser) {
    return this.participation.applications(slug, user, input.cursor);
  }
  @Post(":slug/participation/application-notifications")
  async applicationNotifications(@Param("slug") slug: string, @Body() input: TournamentApplicationNotificationsDto,
    @CurrentUser() user: AuthenticatedUser, @Req() request: RequestLike) {
    await this.rateLimiter.assertWithinLimits(createSocialWriteRateLimitRules(user.id, request));
    return this.participation.setApplicationNotifications(slug, input.enabled, user);
  }
  @Get(":slug/participation/application-requests/:requestId")
  @Header("Cache-Control", "private, no-store")
  applicationProfile(@Param("slug") slug: string, @Param("requestId", new ParseUUIDPipe({ version: "4" })) requestId: string,
    @CurrentUser() user: AuthenticatedUser) { return this.participation.applicationProfile(slug, requestId, user); }
  @Post(":slug/participation/application-requests/:requestId/decision")
  async decideApplicationRequest(@Param("slug") slug: string, @Param("requestId", new ParseUUIDPipe({ version: "4" })) requestId: string,
    @Body() input: TournamentApplicationDecisionDto, @CurrentUser() user: AuthenticatedUser, @Req() request: RequestLike) {
    await this.rateLimiter.assertWithinLimits(createSocialWriteRateLimitRules(user.id, request));
    return this.participation.decideApplicationRequest(slug, requestId, input, user);
  }
  @Post(":slug/participation/applications/:noticeId/decision")
  async decideApplication(@Param("slug") slug: string, @Param("noticeId", new ParseUUIDPipe({ version: "4" })) noticeId: string,
    @Body() input: DecideDotaTournamentEntryRequestDto, @CurrentUser() user: AuthenticatedUser, @Req() request: RequestLike) {
    await this.rateLimiter.assertWithinLimits(createSocialWriteRateLimitRules(user.id, request));
    return this.participation.decideApplication(slug, noticeId, input.decision, user);
  }
}
