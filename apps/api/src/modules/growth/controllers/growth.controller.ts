import { Controller, Get, Headers, Param, Post, Body, Req, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import type { RequestLike } from "../../../common/rate-limiting/api-rate-limiter.service.js";
import { OptionalJwtAuthGuard } from "../../auth/guards/optional-jwt-auth.guard.js";
import type {
  GrowthBattleResponseDto,
  GrowthBattleVoteResponseDto,
  GrowthCompareResponseDto
} from "../dto/growth.dto.js";
import { SubmitBattleVoteDto } from "../dto/submit-battle-vote.dto.js";
import { GrowthCompareService } from "../services/growth-compare.service.js";

@Controller("growth")
export class GrowthController {
  constructor(private readonly growthCompareService: GrowthCompareService) {}

  @Get("compare/entities/:leftEntityId/:rightEntityId")
  async getCompareByEntityIds(
    @Param("leftEntityId") leftEntityId: string,
    @Param("rightEntityId") rightEntityId: string
  ): Promise<GrowthCompareResponseDto> {
    return this.growthCompareService.getCompareByEntityIds(leftEntityId, rightEntityId);
  }

  @Get("compare/:pairSlug")
  async getCompare(@Param("pairSlug") pairSlug: string): Promise<GrowthCompareResponseDto> {
    return this.growthCompareService.getCompare(pairSlug);
  }

  @Get("battle/:pairSlug")
  async getBattle(
    @Param("pairSlug") pairSlug: string,
    @Headers("x-opinia-voter") voterHeader: string | undefined,
    @Req() request: RequestLike
  ): Promise<GrowthBattleResponseDto> {
    return this.growthCompareService.getBattle(pairSlug, voterHeader, request);
  }

  @Post("battle/:pairSlug/vote")
  @UseGuards(OptionalJwtAuthGuard)
  async submitBattleVote(
    @Param("pairSlug") pairSlug: string,
    @Body() body: SubmitBattleVoteDto,
    @Headers("x-opinia-voter") voterHeader: string | undefined,
    @Req() request: RequestLike,
    @CurrentUser() currentUser?: AuthenticatedUser
  ): Promise<GrowthBattleVoteResponseDto> {
    return this.growthCompareService.submitBattleVote(
      pairSlug,
      body.entityId,
      voterHeader,
      request,
      currentUser?.id
    );
  }
}
