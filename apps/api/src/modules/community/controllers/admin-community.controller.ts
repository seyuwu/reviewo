import { Controller, Get, Query, UseGuards } from "@nestjs/common";

import { AdminGuard } from "../../auth/guards/admin.guard.js";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard.js";
import { ProductAnalyticsService } from "../../analytics/services/product-analytics.service.js";
import type {
  AdminContributorsResponseDto,
  EconomyOverviewDto,
  PlatformHealthDto,
  SpotlightAnalyticsDto
} from "../dto/admin-community.dto.js";
import { AdminCommunityService } from "../services/admin-community.service.js";

@Controller("admin/community")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminCommunityController {
  constructor(private readonly adminCommunityService: AdminCommunityService) {}

  @Get("platform/health")
  async getPlatformHealth(): Promise<PlatformHealthDto> {
    return this.adminCommunityService.getPlatformHealth();
  }

  @Get("economy/overview")
  async getEconomyOverview(): Promise<EconomyOverviewDto> {
    return this.adminCommunityService.getEconomyOverview();
  }

  @Get("economy/spotlight")
  async getSpotlightAnalytics(@Query("days") days?: string): Promise<SpotlightAnalyticsDto> {
    const parsedDays = days ? Number.parseInt(days, 10) : 30;

    return this.adminCommunityService.getSpotlightAnalytics(
      Number.isFinite(parsedDays) ? parsedDays : 30
    );
  }

  @Get("contributors")
  async listContributors(
    @Query("limit") limit?: string,
    @Query("cursor") cursor?: string
  ): Promise<AdminContributorsResponseDto> {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : 50;

    return this.adminCommunityService.listTopContributors(
      Number.isFinite(parsedLimit) ? parsedLimit : 50,
      cursor
    );
  }
}

@Controller("admin/analytics")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminAnalyticsController {
  constructor(private readonly productAnalyticsService: ProductAnalyticsService) {}

  @Get("overview")
  getOverview(@Query("days") days?: string) {
    const parsed = days ? Number.parseInt(days, 10) : 7;
    return this.productAnalyticsService.getOverview(Number.isFinite(parsed) ? parsed : 7);
  }
}
