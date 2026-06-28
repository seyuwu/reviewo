import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Req, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import {
  ApiRateLimiterService,
  type RequestLike
} from "../../../common/rate-limiting/api-rate-limiter.service.js";
import { createRatingRateLimitRules } from "../../../common/rate-limiting/rating-rate-limit-rules.js";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard.js";
import { RateEntityDto } from "../dto/rate-entity.dto.js";
import { RatingAggregateDto } from "../dto/rating-aggregate.dto.js";
import { RateEntityResponseDto, UserRatingDto } from "../dto/rating-response.dto.js";
import { RatingsService } from "../services/ratings.service.js";

@Controller("ratings/entities/:entityId")
export class RatingsController {
  constructor(
    private readonly apiRateLimiterService: ApiRateLimiterService,
    private readonly ratingsService: RatingsService
  ) {}

  @Get()
  async getAggregate(
    @Param("entityId", new ParseUUIDPipe({ version: "4" })) entityId: string
  ): Promise<RatingAggregateDto> {
    return this.ratingsService.getAggregate(entityId);
  }

  @Get("my-rating")
  @UseGuards(JwtAuthGuard)
  async getMyRating(
    @Param("entityId", new ParseUUIDPipe({ version: "4" })) entityId: string,
    @CurrentUser() currentUser: AuthenticatedUser
  ): Promise<UserRatingDto | null> {
    return this.ratingsService.getMyRating(entityId, currentUser);
  }

  @Put("my-rating")
  @UseGuards(JwtAuthGuard)
  async rateEntity(
    @Param("entityId", new ParseUUIDPipe({ version: "4" })) entityId: string,
    @Body() input: RateEntityDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike
  ): Promise<RateEntityResponseDto> {
    await this.apiRateLimiterService.assertWithinLimits(
      createRatingRateLimitRules(currentUser.id, request)
    );

    return this.ratingsService.rateEntity(entityId, input, currentUser);
  }
}
