import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards
} from "@nestjs/common";

import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../common/interfaces/authenticated-request.js";
import {
  ApiRateLimiterService,
  type RequestLike
} from "../../common/rate-limiting/api-rate-limiter.service.js";
import { createSocialWriteRateLimitRules } from "../../common/rate-limiting/write-rate-limit-rules.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { OptionalJwtAuthGuard } from "../auth/guards/optional-jwt-auth.guard.js";
import { RegisterDotaTournamentTeamDto } from "./dto/register-dota-tournament-team.dto.js";
import { CreateDotaTournamentSquadDto } from "./dto/create-dota-tournament-squad.dto.js";
import {
  DecideDotaTournamentEntryRequestDto,
  JoinDotaTournamentEntryDto,
  UpdateDotaTournamentEntryJoinModeDto
} from "./dto/join-dota-tournament-entry.dto.js";
import {
  ConfirmDotaTournamentLobbyDto,
  DisputeDotaTournamentMatchDto,
  SubmitDotaTournamentLobbyDto,
  SubmitDotaTournamentResultDto
} from "./dto/create-dota-tournament-match.dto.js";
import { DotaTournamentsService } from "./tournaments.service.js";

@Controller("dota/tournaments")
export class DotaTournamentsController {
  constructor(
    private readonly apiRateLimiterService: ApiRateLimiterService,
    private readonly dotaTournamentsService: DotaTournamentsService
  ) {}

  @Get()
  list() {
    return this.dotaTournamentsService.listPublic();
  }

  @Get(":slug")
  get(@Param("slug") slug: string) {
    return this.dotaTournamentsService.getPublic(slug);
  }

  @Get(":slug/managed-entries")
  @UseGuards(JwtAuthGuard)
  listManagedEntries(@Param("slug") slug: string, @CurrentUser() currentUser: AuthenticatedUser) {
    return this.dotaTournamentsService.listManagedEntries(slug, currentUser);
  }

  @Get(":slug/matches/:matchId")
  @UseGuards(JwtAuthGuard)
  getMatch(
    @Param("slug") slug: string,
    @Param("matchId") matchId: string,
    @CurrentUser() currentUser: AuthenticatedUser
  ) {
    return this.dotaTournamentsService.getParticipantMatch(slug, matchId, currentUser);
  }

  @Get(":slug/matches/:matchId/public")
  @UseGuards(OptionalJwtAuthGuard)
  @Header("Cache-Control", "private, no-store")
  getPublicMatch(
    @Param("slug") slug: string,
    @Param("matchId", new ParseUUIDPipe()) matchId: string,
    @CurrentUser() currentUser?: AuthenticatedUser
  ) {
    return this.dotaTournamentsService.getPublicMatch(slug, matchId, currentUser);
  }

  @Post(":slug/matches/:matchId/lobby")
  @UseGuards(JwtAuthGuard)
  async submitLobby(
    @Param("slug") slug: string,
    @Param("matchId") matchId: string,
    @Body() input: SubmitDotaTournamentLobbyDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike
  ) {
    await this.rateLimit(currentUser, request);
    return this.dotaTournamentsService.submitLobby(slug, matchId, input, currentUser);
  }

  @Post(":slug/matches/:matchId/confirm-lobby")
  @UseGuards(JwtAuthGuard)
  async confirmLobby(
    @Param("slug") slug: string,
    @Param("matchId") matchId: string,
    @Body() input: ConfirmDotaTournamentLobbyDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike
  ) {
    await this.rateLimit(currentUser, request);
    return this.dotaTournamentsService.confirmLobby(slug, matchId, input, currentUser);
  }

  @Post(":slug/matches/:matchId/start")
  @UseGuards(JwtAuthGuard)
  async startMatch(
    @Param("slug") slug: string,
    @Param("matchId") matchId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike
  ) {
    await this.rateLimit(currentUser, request);
    return this.dotaTournamentsService.startMatch(slug, matchId, currentUser);
  }

  @Post(":slug/matches/:matchId/result")
  @UseGuards(JwtAuthGuard)
  async submitResult(
    @Param("slug") slug: string,
    @Param("matchId") matchId: string,
    @Body() input: SubmitDotaTournamentResultDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike
  ) {
    await this.rateLimit(currentUser, request);
    return this.dotaTournamentsService.submitResult(slug, matchId, input, currentUser);
  }

  @Post(":slug/matches/:matchId/confirm-result")
  @UseGuards(JwtAuthGuard)
  async confirmResult(
    @Param("slug") slug: string,
    @Param("matchId") matchId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike
  ) {
    await this.rateLimit(currentUser, request);
    return this.dotaTournamentsService.confirmResult(slug, matchId, currentUser);
  }

  @Post(":slug/matches/:matchId/dispute")
  @UseGuards(JwtAuthGuard)
  async disputeMatch(
    @Param("slug") slug: string,
    @Param("matchId") matchId: string,
    @Body() input: DisputeDotaTournamentMatchDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike
  ) {
    await this.rateLimit(currentUser, request);
    return this.dotaTournamentsService.disputeMatch(slug, matchId, input, currentUser);
  }

  @Post(":slug/entries")
  @UseGuards(JwtAuthGuard)
  async registerTeam(
    @Param("slug") slug: string,
    @Body() input: RegisterDotaTournamentTeamDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike
  ) {
    await this.rateLimit(currentUser, request);
    return this.dotaTournamentsService.registerTeam(slug, input, currentUser);
  }

  @Post(":slug/squads")
  @UseGuards(JwtAuthGuard)
  async createSquad(
    @Param("slug") slug: string,
    @Body() input: CreateDotaTournamentSquadDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike
  ) {
    await this.rateLimit(currentUser, request);
    return this.dotaTournamentsService.createSquad(slug, input, currentUser);
  }

  @Post(":slug/entries/:entryId/join")
  @UseGuards(JwtAuthGuard)
  async joinEntry(
    @Param("slug") slug: string,
    @Param("entryId") entryId: string,
    @Body() input: JoinDotaTournamentEntryDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike
  ) {
    await this.rateLimit(currentUser, request);
    return this.dotaTournamentsService.joinEntry(slug, entryId, input, currentUser);
  }

  @Patch(":slug/entries/:entryId/join-mode")
  @UseGuards(JwtAuthGuard)
  async setJoinMode(
    @Param("slug") slug: string,
    @Param("entryId") entryId: string,
    @Body() input: UpdateDotaTournamentEntryJoinModeDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike
  ) {
    await this.rateLimit(currentUser, request);
    return this.dotaTournamentsService.setEntryJoinMode(slug, entryId, input.joinMode, currentUser);
  }

  @Patch(":slug/entries/:entryId/requests/:requestId")
  @UseGuards(JwtAuthGuard)
  async decideJoinRequest(
    @Param("slug") slug: string,
    @Param("entryId") entryId: string,
    @Param("requestId") requestId: string,
    @Body() input: DecideDotaTournamentEntryRequestDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike
  ) {
    await this.rateLimit(currentUser, request);
    return this.dotaTournamentsService.decideJoinRequest(
      slug,
      entryId,
      requestId,
      input.decision,
      currentUser
    );
  }

  @Patch(":slug/entries/:entryId/members/me/position")
  @UseGuards(JwtAuthGuard)
  async assignPosition(
    @Param("slug") slug: string,
    @Param("entryId") entryId: string,
    @Body() input: JoinDotaTournamentEntryDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike
  ) {
    await this.rateLimit(currentUser, request);
    return this.dotaTournamentsService.assignEntryPosition(
      slug,
      entryId,
      input.positionRole,
      currentUser
    );
  }

  @Delete(":slug/entries/:entryId/members/me")
  @UseGuards(JwtAuthGuard)
  async leaveEntry(
    @Param("slug") slug: string,
    @Param("entryId") entryId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike
  ) {
    await this.rateLimit(currentUser, request);
    return this.dotaTournamentsService.leaveEntry(slug, entryId, currentUser);
  }

  @Get("teams/:teamSlug/entries")
  @UseGuards(JwtAuthGuard)
  listTeamEntries(
    @Param("teamSlug") teamSlug: string,
    @CurrentUser() currentUser: AuthenticatedUser
  ) {
    return this.dotaTournamentsService.listTeamEntries(teamSlug, currentUser);
  }

  @Delete(":slug/entries/:entryId")
  @UseGuards(JwtAuthGuard)
  async withdrawTeam(
    @Param("slug") slug: string,
    @Param("entryId") entryId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike
  ) {
    await this.rateLimit(currentUser, request);
    return this.dotaTournamentsService.withdrawTeam(slug, entryId, currentUser);
  }

  private rateLimit(currentUser: AuthenticatedUser, request: RequestLike): Promise<void> {
    return this.apiRateLimiterService.assertWithinLimits(
      createSocialWriteRateLimitRules(currentUser.id, request)
    );
  }
}
