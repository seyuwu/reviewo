import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { ContributionStatus, ContributionType } from "#prisma/client";

import { CurrentUser } from "../../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import { AdminGuard } from "../../auth/guards/admin.guard.js";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard.js";
import type {
  AdminContributionListResponseDto,
  AdminContributionStatsDto
} from "../dto/admin-contribution.dto.js";
import type { ContributionDto } from "../dto/contribution.dto.js";
import { ResolveContributionDto } from "../dto/resolve-contribution.dto.js";
import { ContributionsService } from "../services/contributions.service.js";

@Controller("admin/contributions")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminContributionsController {
  constructor(private readonly contributionsService: ContributionsService) {}

  @Get("stats")
  async getStats(): Promise<AdminContributionStatsDto> {
    return this.contributionsService.getAdminContributionStats();
  }

  @Get()
  async listContributions(
    @Query("status") status?: ContributionStatus,
    @Query("type") type?: ContributionType,
    @Query("limit") limit?: string,
    @Query("cursor") cursor?: string
  ): Promise<AdminContributionListResponseDto> {
    return this.contributionsService.listAdminContributions({
      ...(cursor ? { cursor } : {}),
      ...(limit ? { limit: Number(limit) } : {}),
      ...(status ? { status } : {}),
      ...(type ? { type } : {})
    });
  }

  @Post(":contributionId/resolve")
  async resolveContribution(
    @Param("contributionId", new ParseUUIDPipe({ version: "4" })) contributionId: string,
    @Body() input: ResolveContributionDto,
    @CurrentUser() currentUser: AuthenticatedUser
  ): Promise<ContributionDto> {
    return this.contributionsService.resolveContribution(
      contributionId,
      input.action,
      currentUser
    );
  }
}
