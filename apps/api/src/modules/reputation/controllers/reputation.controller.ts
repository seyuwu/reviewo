import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard.js";
import type { EntityAnalyticsDto } from "../dto/entity-analytics.dto.js";
import type { EntityConfidenceExplanationDto } from "../dto/entity-confidence-explanation.dto.js";
import type { EntityConfidenceDto } from "../dto/entity-analytics.dto.js";
import type { UserTrustProfileDto } from "../dto/user-trust-profile.dto.js";
import { ReputationEngineEnabledGuard } from "../guards/reputation-engine-enabled.guard.js";
import {
  ReputationUserAccessGuard,
  ReputationUserIdParam
} from "../guards/reputation-user-access.guard.js";
import { ReputationService } from "../services/reputation.service.js";

@Controller("reputation")
@UseGuards(ReputationEngineEnabledGuard)
export class ReputationController {
  constructor(private readonly reputationService: ReputationService) {}

  @Get("users/:id")
  @UseGuards(JwtAuthGuard, ReputationUserAccessGuard)
  @ReputationUserIdParam("id")
  async getUserTrustProfile(
    @Param("id", new ParseUUIDPipe({ version: "4" })) userId: string
  ): Promise<UserTrustProfileDto> {
    return this.reputationService.getUserTrustProfile(userId);
  }

  @Get("entities/:entityId")
  async getEntityAnalytics(
    @Param("entityId", new ParseUUIDPipe({ version: "4" })) entityId: string
  ): Promise<EntityAnalyticsDto> {
    return this.reputationService.getEntityAnalytics(entityId);
  }

  @Get("entities/:entityId/confidence")
  async getEntityConfidence(
    @Param("entityId", new ParseUUIDPipe({ version: "4" })) entityId: string
  ): Promise<EntityConfidenceDto> {
    return this.reputationService.getEntityConfidence(entityId);
  }

  @Get("entities/:entityId/explanation")
  async getEntityConfidenceExplanation(
    @Param("entityId", new ParseUUIDPipe({ version: "4" })) entityId: string
  ): Promise<EntityConfidenceExplanationDto> {
    return this.reputationService.getEntityConfidenceExplanation(entityId);
  }
}
