import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from "@nestjs/common";

import {
  ApiRateLimiterService,
  type RequestLike
} from "../../../common/rate-limiting/api-rate-limiter.service.js";
import { createSpotlightEndorseRateLimitRules, createSpotlightEventRateLimitRules, createSpotlightSpendRateLimitRules } from "../../../common/rate-limiting/write-rate-limit-rules.js";
import { CurrentUser } from "../../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard.js";
import { OptionalJwtAuthGuard } from "../../auth/guards/optional-jwt-auth.guard.js";
import { SpotlightFeedQueryDto } from "../dto/spotlight-feed-query.dto.js";
import {
  CreateSpotlightBattleDto,
  CreateSpotlightEntityDto,
  CreateSpotlightTopDto,
  SPOTLIGHT_COSTS_PUBLIC,
  type SpotlightCreditsDto,
  type SpotlightEndorseResponseDto,
  type SpotlightFeedResponseDto,
  type SpendSpotlightResponseDto
} from "../dto/spotlight.dto.js";
import {
  RecordSpotlightPlacementEventDto,
  type RecordSpotlightPlacementEventResponseDto
} from "../dto/spotlight-tracking.dto.js";
import { SpotlightCreditsService } from "../services/spotlight-credits.service.js";
import { SpotlightEndorsementService } from "../services/spotlight-endorsement.service.js";
import { SpotlightService } from "../services/spotlight.service.js";
import { SpotlightTrackingService } from "../services/spotlight-tracking.service.js";
import { parseSpotlightContentLocale } from "../lib/spotlight-recommendation.mapper.js";

@Controller()
export class SpotlightController {
  constructor(
    private readonly apiRateLimiterService: ApiRateLimiterService,
    private readonly spotlightCreditsService: SpotlightCreditsService,
    private readonly spotlightEndorsementService: SpotlightEndorsementService,
    private readonly spotlightService: SpotlightService,
    private readonly spotlightTrackingService: SpotlightTrackingService
  ) {}

  @Get("spotlight")
  @UseGuards(OptionalJwtAuthGuard)
  async getSpotlightFeed(
    @Query() query: SpotlightFeedQueryDto,
    @CurrentUser() currentUser?: AuthenticatedUser
  ): Promise<SpotlightFeedResponseDto> {
    const safeLimit = query.limit ?? 30;
    const locale = parseSpotlightContentLocale(query.locale);

    return this.spotlightService.getFeed(safeLimit, locale, currentUser?.id);
  }

  @Get("spotlight/costs")
  getSpotlightCosts() {
    return SPOTLIGHT_COSTS_PUBLIC;
  }

  @Get("users/me/spotlight-credits")
  @UseGuards(JwtAuthGuard)
  async getMySpotlightCredits(
    @CurrentUser() currentUser: AuthenticatedUser
  ): Promise<SpotlightCreditsDto> {
    return this.spotlightCreditsService.getCreditsForUser(currentUser.id);
  }

  @Post("spotlight/placements/:placementId/events")
  @UseGuards(OptionalJwtAuthGuard)
  async recordPlacementEvent(
    @Param("placementId", new ParseUUIDPipe({ version: "4" })) placementId: string,
    @Body() body: RecordSpotlightPlacementEventDto,
    @Req() request: RequestLike,
    @CurrentUser() currentUser?: AuthenticatedUser
  ): Promise<RecordSpotlightPlacementEventResponseDto> {
    await this.apiRateLimiterService.assertWithinLimits(
      createSpotlightEventRateLimitRules(request)
    );

    return this.spotlightTrackingService.recordEvent({
      eventType: body.eventType,
      placementId,
      ...(currentUser ? { userId: currentUser.id } : {}),
      viewerKey: body.viewerKey
    });
  }

  @Post("spotlight/placements/:placementId/endorse")
  @UseGuards(JwtAuthGuard)
  async endorsePlacement(
    @Param("placementId", new ParseUUIDPipe({ version: "4" })) placementId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike
  ): Promise<SpotlightEndorseResponseDto> {
    await this.apiRateLimiterService.assertWithinLimits(
      createSpotlightEndorseRateLimitRules(currentUser.id, request)
    );

    return this.spotlightEndorsementService.endorse(placementId, currentUser.id);
  }

  @Delete("spotlight/placements/:placementId/endorse")
  @UseGuards(JwtAuthGuard)
  async unendorsePlacement(
    @Param("placementId", new ParseUUIDPipe({ version: "4" })) placementId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike
  ): Promise<SpotlightEndorseResponseDto> {
    await this.apiRateLimiterService.assertWithinLimits(
      createSpotlightEndorseRateLimitRules(currentUser.id, request)
    );

    return this.spotlightEndorsementService.unendorse(placementId, currentUser.id);
  }

  @Post("spotlight/entity")
  @UseGuards(JwtAuthGuard)
  async spendOnEntity(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: CreateSpotlightEntityDto,
    @Req() request: RequestLike
  ): Promise<SpendSpotlightResponseDto> {
    await this.apiRateLimiterService.assertWithinLimits(
      createSpotlightSpendRateLimitRules(currentUser.id, request)
    );

    return this.spotlightService.spendOnEntity(currentUser.id, body);
  }

  @Post("spotlight/battle")
  @UseGuards(JwtAuthGuard)
  async spendOnBattle(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: CreateSpotlightBattleDto,
    @Req() request: RequestLike
  ): Promise<SpendSpotlightResponseDto> {
    await this.apiRateLimiterService.assertWithinLimits(
      createSpotlightSpendRateLimitRules(currentUser.id, request)
    );

    return this.spotlightService.spendOnBattle(currentUser.id, body);
  }

  @Post("spotlight/top")
  @UseGuards(JwtAuthGuard)
  async spendOnTop(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: CreateSpotlightTopDto,
    @Req() request: RequestLike
  ): Promise<SpendSpotlightResponseDto> {
    await this.apiRateLimiterService.assertWithinLimits(
      createSpotlightSpendRateLimitRules(currentUser.id, request)
    );

    return this.spotlightService.spendOnTop(currentUser.id, body);
  }
}
