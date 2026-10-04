import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../common/interfaces/authenticated-request.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { TournamentManagerGuard } from "./tournament-manager.guard.js";
import {
  CreateDotaTournamentDto,
  UpdateDotaTournamentDto
} from "./dto/create-dota-tournament.dto.js";
import {
  CreateDotaTournamentMatchDto,
  ResolveDotaTournamentMatchDto
} from "./dto/create-dota-tournament-match.dto.js";
import { DotaTournamentsService } from "./tournaments.service.js";

@Controller("dota/tournament-management")
@UseGuards(JwtAuthGuard, TournamentManagerGuard)
export class AdminDotaTournamentsController {
  constructor(private readonly dotaTournamentsService: DotaTournamentsService) {}

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

  @Patch(":slug")
  update(@Param("slug") slug: string, @Body() input: UpdateDotaTournamentDto) {
    return this.dotaTournamentsService.update(slug, input);
  }
}
