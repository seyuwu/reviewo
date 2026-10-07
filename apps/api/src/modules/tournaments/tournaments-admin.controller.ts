import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../common/interfaces/authenticated-request.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { TournamentManagerGuard } from "./tournament-manager.guard.js";
import { TournamentTelegramLinkedGuard } from "./tournament-telegram-linked.guard.js";
import {
  CreateDotaTournamentDto,
  UpdateDotaTournamentDto
} from "./dto/create-dota-tournament.dto.js";
import {
  SubmitDotaTournamentLobbyDto,
  SubmitDotaTournamentMatchGameDto,
  CreateDotaTournamentMatchDto,
  ConfirmDotaTournamentStageDto,
  ResolveDotaTournamentMatchDto
} from "./dto/create-dota-tournament-match.dto.js";
import { DotaTournamentsService } from "./tournaments.service.js";
import { DotaTournamentPlansService } from "./tournament-plans.service.js";
import { UpdateTournamentMatchPlanDto, UpdateTournamentSeriesSettingsDto } from "./dto/tournament-match-plan.dto.js";
import { ReplaceTournamentMatchSideDto } from "./dto/replace-tournament-match-side.dto.js";

@Controller("dota/tournament-management")
@UseGuards(JwtAuthGuard, TournamentTelegramLinkedGuard, TournamentManagerGuard)
export class AdminDotaTournamentsController {
  constructor(private readonly dotaTournamentsService: DotaTournamentsService,
    private readonly plans: DotaTournamentPlansService) {}

  @Get()
  list() {
    return this.dotaTournamentsService.listForAdmin();
  }

  @Post()
  create(
    @Body() input: CreateDotaTournamentDto,
    @CurrentUser() currentUser: AuthenticatedUser
  ) {
    return this.dotaTournamentsService.create(input, currentUser);
  }

  @Get(":slug/matches")
  listMatches(@Param("slug") slug: string) {
    return this.dotaTournamentsService.listAdminMatches(slug);
  }

  @Get(":slug/bracket-plan")
  getPlan(@Param("slug") slug: string, @CurrentUser() user: AuthenticatedUser) {
    return this.plans.get(slug, user);
  }

  @Get(":slug/matches/:matchId")
  @Header("Cache-Control", "private, no-store")
  getMatch(@Param("slug") slug: string, @Param("matchId", ParseUUIDPipe) matchId: string,
    @CurrentUser() user: AuthenticatedUser) {
    return this.dotaTournamentsService.getStaffMatch(slug, matchId, user);
  }

  @Post(":slug/matches/:matchId/lobby")
  submitManagedLobby(@Param("slug") slug: string, @Param("matchId", ParseUUIDPipe) matchId: string,
    @Body() input: SubmitDotaTournamentLobbyDto, @CurrentUser() user: AuthenticatedUser) {
    return this.dotaTournamentsService.submitManagedLobby(slug, matchId, input, user);
  }

  @Post(":slug/matches/:matchId/start")
  startManagedMatch(@Param("slug") slug: string, @Param("matchId", ParseUUIDPipe) matchId: string,
    @CurrentUser() user: AuthenticatedUser) {
    return this.dotaTournamentsService.startManagedMatch(slug, matchId, user);
  }

  @Post(":slug/matches/:matchId/game-id")
  saveManagedGameId(@Param("slug") slug: string, @Param("matchId", ParseUUIDPipe) matchId: string,
    @Body() input: SubmitDotaTournamentMatchGameDto, @CurrentUser() user: AuthenticatedUser) {
    return this.dotaTournamentsService.submitManagedMatchGameId(slug, matchId, input, user);
  }

  @Patch(":slug/bracket-plan")
  savePlan(@Param("slug") slug: string, @Body() input: UpdateTournamentMatchPlanDto,
    @CurrentUser() user: AuthenticatedUser) {
    return this.plans.save(slug, input, user);
  }

  @Patch("matches/:matchId/settings")
  saveMatchSettings(@Param("matchId") matchId: string, @Body() input: UpdateTournamentSeriesSettingsDto,
    @CurrentUser() user: AuthenticatedUser) {
    return this.plans.saveMatch(matchId, input, user);
  }

  @Post(":slug/matches")
  createMatch(
    @Param("slug") slug: string,
    @Body() input: CreateDotaTournamentMatchDto,
    @CurrentUser() currentUser: AuthenticatedUser
  ) {
    return this.dotaTournamentsService.createAdminMatch(slug, input, currentUser);
  }

  @Post("matches/:matchId/resolve")
  resolveMatch(
    @Param("matchId") matchId: string,
    @Body() input: ResolveDotaTournamentMatchDto,
    @CurrentUser() currentUser: AuthenticatedUser
  ) {
    return this.dotaTournamentsService.resolveAdminMatch(matchId, input, currentUser);
  }

  @Post(":slug/matches/:matchId/confirm-stage")
  confirmStage(@Param("slug") slug: string, @Param("matchId", ParseUUIDPipe) matchId: string,
    @Body() input: ConfirmDotaTournamentStageDto, @CurrentUser() user: AuthenticatedUser) {
    return this.dotaTournamentsService.confirmManagedStage(slug, matchId, input, user);
  }

  @Post(":slug/matches/:matchId/replace-reserve")
  replaceWithReserve(
    @Param("slug") slug: string,
    @Param("matchId", ParseUUIDPipe) matchId: string,
    @Body() input: ReplaceTournamentMatchSideDto,
    @CurrentUser() currentUser: AuthenticatedUser
  ) {
    return this.dotaTournamentsService.replaceMatchSideWithReserve(slug, matchId, input, currentUser);
  }

  @Patch(":slug")
  update(@Param("slug") slug: string, @Body() input: UpdateDotaTournamentDto) {
    return this.dotaTournamentsService.update(slug, input);
  }
}
