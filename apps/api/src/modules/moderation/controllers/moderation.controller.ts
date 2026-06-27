import { Controller, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";

import { AdminGuard } from "../../auth/guards/admin.guard.js";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard.js";
import type { HideEntityResponseDto } from "../dto/hide-content-response.dto.js";
import type { HideReviewResponseDto } from "../dto/hide-content-response.dto.js";
import { ModerationService } from "../services/moderation.service.js";

@Controller("moderation")
@UseGuards(JwtAuthGuard, AdminGuard)
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  @Post("entities/:entityId/hide")
  async hideEntity(
    @Param("entityId", new ParseUUIDPipe({ version: "4" })) entityId: string
  ): Promise<HideEntityResponseDto> {
    return this.moderationService.hideEntity(entityId);
  }

  @Post("entities/:entityId/unhide")
  async unhideEntity(
    @Param("entityId", new ParseUUIDPipe({ version: "4" })) entityId: string
  ): Promise<HideEntityResponseDto> {
    return this.moderationService.unhideEntity(entityId);
  }

  @Post("reviews/:reviewId/hide")
  async hideReview(
    @Param("reviewId", new ParseUUIDPipe({ version: "4" })) reviewId: string
  ): Promise<HideReviewResponseDto> {
    return this.moderationService.hideReview(reviewId);
  }

  @Post("reviews/:reviewId/unhide")
  async unhideReview(
    @Param("reviewId", new ParseUUIDPipe({ version: "4" })) reviewId: string
  ): Promise<HideReviewResponseDto> {
    return this.moderationService.unhideReview(reviewId);
  }
}
