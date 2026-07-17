import { Body, Controller, Get, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import {
  ApiRateLimiterService,
  type RequestLike
} from "../../../common/rate-limiting/api-rate-limiter.service.js";
import {
  createGamesLaunchDevNoteLikeRateLimitRules,
  createGamesLaunchInterestRateLimitRules,
  createGamesLaunchSuggestionRateLimitRules
} from "../../../common/rate-limiting/write-rate-limit-rules.js";
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
  constructor(
    private readonly apiRateLimiterService: ApiRateLimiterService,
    private readonly gamesLaunchService: GamesLaunchService
  ) {}

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
  @UseGuards(OptionalJwtAuthGuard)
  async createInterest(
    @Body() input: CreateGamesLaunchInterestDto,
    @CurrentUser() currentUser: AuthenticatedUser | undefined,
    @Req() request: RequestLike
  ): Promise<{ ok: true }> {
    await this.apiRateLimiterService.assertWithinLimits(
      createGamesLaunchInterestRateLimitRules(request)
    );
    return this.gamesLaunchService.createInterest(input, currentUser?.id);
  }

  @Post("suggestions")
  @UseGuards(OptionalJwtAuthGuard)
  async createSuggestion(
    @Body() input: CreateGamesLaunchSuggestionDto,
    @CurrentUser() currentUser: AuthenticatedUser | undefined,
    @Req() request: RequestLike
  ): Promise<{ ok: true }> {
    await this.apiRateLimiterService.assertWithinLimits(
      createGamesLaunchSuggestionRateLimitRules(request)
    );
    return this.gamesLaunchService.createSuggestion(input, currentUser?.id);
  }

  @Post("dev-note/like")
  @UseGuards(OptionalJwtAuthGuard)
  async toggleDevNoteLike(
    @Body() input: ToggleGamesLaunchDevNoteLikeDto,
    @CurrentUser() currentUser: AuthenticatedUser | undefined,
    @Req() request: RequestLike
  ): Promise<{ likeCount: number; liked: boolean }> {
    await this.apiRateLimiterService.assertWithinLimits(
      createGamesLaunchDevNoteLikeRateLimitRules(request)
    );
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
    return this.gamesLaunchService.setSearchLive(input.searchLive, currentUser);
  }
}
