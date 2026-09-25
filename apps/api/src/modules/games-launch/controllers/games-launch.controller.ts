import { Body, Controller, Get, Patch, Post, Query, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import {
  createGamesLaunchDevNoteLikeRateLimitRules,
  createGamesLaunchInterestRateLimitRules,
  createGamesLaunchSuggestionRateLimitRules
} from "../../../common/rate-limiting/write-rate-limit-rules.js";
import { RateLimit } from "../../../common/rate-limiting/rate-limit.decorator.js";
import { RateLimitGuard } from "../../../common/rate-limiting/rate-limit.guard.js";
import { AdminGuard } from "../../auth/guards/admin.guard.js";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard.js";
import { OptionalJwtAuthGuard } from "../../auth/guards/optional-jwt-auth.guard.js";
import {
  AdminGamesLaunchListQueryDto,
  CreateGamesLaunchInterestDto,
  CreateGamesLaunchSuggestionDto,
  GamesLaunchDevNoteLikeQueryDto,
  type GamesLaunchStatusDto,
  ToggleGamesLaunchDevNoteLikeDto,
  UpdateGamesLaunchDto
} from "../dto/games-launch.dto.js";
import { GamesLaunchService } from "../services/games-launch.service.js";

@Controller("games/launch")
export class GamesLaunchController {
  constructor(private readonly gamesLaunchService: GamesLaunchService) {}

  @Get("status")
  @UseGuards(OptionalJwtAuthGuard)
  async getStatus(
    @Query() query: GamesLaunchDevNoteLikeQueryDto,
    @CurrentUser() currentUser?: AuthenticatedUser
  ): Promise<GamesLaunchStatusDto> {
    return this.gamesLaunchService.getStatus({
      ...(currentUser?.id ? { userId: currentUser.id } : {}),
      ...(query.voterKey ? { voterKey: query.voterKey } : {})
    });
  }

  @Post("interest")
  @UseGuards(OptionalJwtAuthGuard, RateLimitGuard)
  @RateLimit(({ request }) => createGamesLaunchInterestRateLimitRules(request))
  async createInterest(
    @Body() input: CreateGamesLaunchInterestDto,
    @CurrentUser() currentUser: AuthenticatedUser | undefined
  ): Promise<{ ok: true }> {
    return this.gamesLaunchService.createInterest(input, currentUser?.id);
  }

  @Post("suggestions")
  @UseGuards(OptionalJwtAuthGuard, RateLimitGuard)
  @RateLimit(({ request }) => createGamesLaunchSuggestionRateLimitRules(request))
  async createSuggestion(
    @Body() input: CreateGamesLaunchSuggestionDto,
    @CurrentUser() currentUser: AuthenticatedUser | undefined
  ): Promise<{ ok: true }> {
    return this.gamesLaunchService.createSuggestion(input, currentUser?.id);
  }

  @Post("dev-note/like")
  @UseGuards(OptionalJwtAuthGuard, RateLimitGuard)
  @RateLimit(({ request }) => createGamesLaunchDevNoteLikeRateLimitRules(request))
  async toggleDevNoteLike(
    @Body() input: ToggleGamesLaunchDevNoteLikeDto,
    @CurrentUser() currentUser: AuthenticatedUser | undefined
  ): Promise<{ likeCount: number; liked: boolean }> {
    return this.gamesLaunchService.toggleDevNoteLike({
      ...(currentUser?.id ? { userId: currentUser.id } : {}),
      ...(input.voterKey ? { voterKey: input.voterKey } : {})
    });
  }
}

@Controller("admin/games/launch")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminGamesLaunchController {
  constructor(private readonly gamesLaunchService: GamesLaunchService) {}

  @Get()
  async getStatus(): Promise<GamesLaunchStatusDto> {
    return this.gamesLaunchService.getStatus();
  }

  @Get("interests")
  async listInterests(@Query() query: AdminGamesLaunchListQueryDto) {
    return this.gamesLaunchService.listInterests(query.limit ?? 100);
  }

  @Get("suggestions")
  async listSuggestions(@Query() query: AdminGamesLaunchListQueryDto) {
    return this.gamesLaunchService.listSuggestions(query.limit ?? 100);
  }

  @Get("metrics")
  async getMetrics(@Query("days") daysRaw?: string) {
    const days = Number(daysRaw ?? 7);
    return this.gamesLaunchService.getWaitlistMetrics(Number.isFinite(days) ? days : 7);
  }

  @Patch()
  async update(
    @Body() input: UpdateGamesLaunchDto,
    @CurrentUser() currentUser: AuthenticatedUser
  ): Promise<GamesLaunchStatusDto> {
    return this.gamesLaunchService.updateSettings(input, currentUser);
  }
}
