import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards
} from "@nestjs/common";

import { CurrentUser } from "../../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard.js";
import { ReviewDto } from "../dto/review.dto.js";
import { UpsertReviewDto } from "../dto/upsert-review.dto.js";
import { ReviewsService } from "../services/reviews.service.js";

@Controller()
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Put("reviews/entities/:entityId/my-review")
  @UseGuards(JwtAuthGuard)
  async upsertMyReview(
    @Param("entityId", new ParseUUIDPipe({ version: "4" })) entityId: string,
    @Body() input: UpsertReviewDto,
    @CurrentUser() currentUser: AuthenticatedUser
  ): Promise<ReviewDto> {
    return this.reviewsService.upsertMyReview(entityId, input, currentUser);
  }

  @Get("reviews/entities/:entityId")
  async listReviews(
    @Param("entityId", new ParseUUIDPipe({ version: "4" })) entityId: string
  ): Promise<ReviewDto[]> {
    return this.reviewsService.listReviewsForEntity(entityId);
  }

  @Get("reviews/entities/:entityId/my-review")
  @UseGuards(JwtAuthGuard)
  async getMyReview(
    @Param("entityId", new ParseUUIDPipe({ version: "4" })) entityId: string,
    @CurrentUser() currentUser: AuthenticatedUser
  ): Promise<ReviewDto | null> {
    return this.reviewsService.getMyReview(entityId, currentUser);
  }

  @Post("reviews/:reviewId/like")
  @UseGuards(JwtAuthGuard)
  async likeReview(
    @Param("reviewId", new ParseUUIDPipe({ version: "4" })) reviewId: string,
    @CurrentUser() currentUser: AuthenticatedUser
  ): Promise<ReviewDto> {
    return this.reviewsService.likeReview(reviewId, currentUser);
  }

  @Delete("reviews/:reviewId/like")
  @UseGuards(JwtAuthGuard)
  async unlikeReview(
    @Param("reviewId", new ParseUUIDPipe({ version: "4" })) reviewId: string,
    @CurrentUser() currentUser: AuthenticatedUser
  ): Promise<ReviewDto> {
    return this.reviewsService.unlikeReview(reviewId, currentUser);
  }
}
