import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard.js";
import { OptionalJwtAuthGuard } from "../../auth/guards/optional-jwt-auth.guard.js";
import type { ContributionProfileDto } from "../dto/contribution-profile.dto.js";
import type { ContributeQueuesResponseDto } from "../dto/contribute-queues.dto.js";
import { CommunityService } from "../services/community.service.js";

@Controller()
export class CommunityController {
  constructor(private readonly communityService: CommunityService) {}

  @Get("users/me/contribution")
  @UseGuards(JwtAuthGuard)
  async getMyContributionProfile(
    @CurrentUser() currentUser: AuthenticatedUser
  ): Promise<ContributionProfileDto> {
    return this.communityService.getMyContributionProfile(currentUser.id);
  }

  @Get("users/:id/contribution")
  async getUserContributionProfile(@Param("id") userId: string): Promise<ContributionProfileDto> {
    return this.communityService.getUserContributionProfile(userId);
  }

  @Get("contribute/queues")
  @UseGuards(OptionalJwtAuthGuard)
  async getContributeQueues(
    @Query("limit") limit?: string,
    @CurrentUser() currentUser?: AuthenticatedUser
  ): Promise<ContributeQueuesResponseDto> {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : 20;
    const safeLimit = Number.isFinite(parsedLimit) ? parsedLimit : 20;

    return this.communityService.getContributeQueues(safeLimit, currentUser?.id);
  }
}
