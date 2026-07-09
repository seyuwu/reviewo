import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";

import { CurrentUser } from "../../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import {
  ApiRateLimiterService,
  type RequestLike
} from "../../../common/rate-limiting/api-rate-limiter.service.js";
import {
  createTopCommentWriteRateLimitRules,
  createTopItemsWriteRateLimitRules,
  createTopLikeRateLimitRules,
  createTopViewRateLimitRules,
  createTopWriteRateLimitRules
} from "../../../common/rate-limiting/write-rate-limit-rules.js";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard.js";
import { AdminGuard } from "../../auth/guards/admin.guard.js";
import { OptionalJwtAuthGuard } from "../../auth/guards/optional-jwt-auth.guard.js";
import { CreateTopDto } from "../dto/create-top.dto.js";
import { CreateTopCategoryDto } from "../dto/create-top-category.dto.js";
import { CreateTopCommentDto } from "../dto/create-top-comment.dto.js";
import { ListTopsByCategoryQueryDto } from "../dto/list-tops-by-category-query.dto.js";
import { ListTopsQueryDto } from "../dto/list-tops-query.dto.js";
import { ReplaceTopItemsDto } from "../dto/replace-top-items.dto.js";
import {
  EntityTopsResponseDto,
  TopCommentDto,
  TopCommentListResponseDto,
  TopDto,
  TopLikeResponseDto,
  TopListResponseDto,
  TopViewResponseDto
} from "../dto/top.dto.js";
import type {
  EntitySystemTopsResponseDto,
  SystemTopCatalogResponseDto,
  SystemTopDetailDto
} from "../dto/system-top.dto.js";
import type { TopCategoryDto, TopCategoryListResponseDto } from "../dto/top-category.dto.js";
import { UpdateTopDto } from "../dto/update-top.dto.js";
import { SystemTopsService } from "../services/system-tops.service.js";
import { TopsService } from "../services/tops.service.js";

@Controller()
export class TopsController {
  constructor(
    private readonly apiRateLimiterService: ApiRateLimiterService,
    private readonly systemTopsService: SystemTopsService,
    private readonly topsService: TopsService
  ) {}

  @Get("tops")
  async listRecentTops(@Query() query: ListTopsQueryDto): Promise<TopListResponseDto> {
    return this.topsService.listRecentTops(query.limit ?? 20, query.cursor, query.sort);
  }

  @Post("tops")
  @UseGuards(JwtAuthGuard)
  async createTop(
    @Body() input: CreateTopDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike
  ): Promise<TopDto> {
    const rateLimitRules = createTopWriteRateLimitRules(currentUser.id, request);

    await this.apiRateLimiterService.checkWithinLimits(rateLimitRules);

    const top = await this.topsService.createTop(input, currentUser);

    await this.apiRateLimiterService.recordLimits(rateLimitRules);

    return top;
  }

  @Get("tops/system")
  async listSystemTops(): Promise<SystemTopCatalogResponseDto> {
    return this.systemTopsService.listCatalog();
  }

  @Get("tops/system/:slug")
  async getSystemTopBySlug(@Param("slug") slug: string): Promise<SystemTopDetailDto> {
    return this.systemTopsService.getSystemTopBySlug(slug);
  }

  @Get("tops/categories")
  async listTopCategories(): Promise<TopCategoryListResponseDto> {
    return this.topsService.listTopCategories();
  }

  @Post("tops/categories")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async createTopCategory(
    @Body() input: CreateTopCategoryDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike
  ): Promise<TopCategoryDto> {
    await this.apiRateLimiterService.assertWithinLimits(
      createTopWriteRateLimitRules(currentUser.id, request)
    );

    return this.topsService.createTopCategory(input, currentUser);
  }

  @Get("tops/category/:slug")
  async listTopsByCategory(
    @Param("slug") slug: string,
    @Query() query: ListTopsByCategoryQueryDto
  ): Promise<TopListResponseDto> {
    return this.topsService.listTopsByCategory(
      slug,
      query.limit ?? 20,
      query.cursor,
      query.sort
    );
  }

  @Get("tops/:slug")
  @UseGuards(OptionalJwtAuthGuard)
  async getTopBySlug(
    @Param("slug") slug: string,
    @CurrentUser() currentUser?: AuthenticatedUser
  ): Promise<TopDto> {
    return this.topsService.getTopBySlug(slug, currentUser?.id);
  }

  @Patch("tops/:id")
  @UseGuards(JwtAuthGuard)
  async updateTop(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() input: UpdateTopDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike
  ): Promise<TopDto> {
    await this.apiRateLimiterService.assertWithinLimits(
      createTopWriteRateLimitRules(currentUser.id, request)
    );

    return this.topsService.updateTop(id, input, currentUser);
  }

  @Delete("tops/:id")
  @UseGuards(JwtAuthGuard)
  async deleteTop(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @CurrentUser() currentUser: AuthenticatedUser
  ): Promise<TopDto> {
    return this.topsService.deleteTop(id, currentUser);
  }

  @Put("tops/:id/items")
  @UseGuards(JwtAuthGuard)
  async replaceTopItems(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() input: ReplaceTopItemsDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike
  ): Promise<TopDto> {
    const rateLimitRules = createTopItemsWriteRateLimitRules(currentUser.id, request);

    await this.apiRateLimiterService.checkWithinLimits(rateLimitRules);

    const top = await this.topsService.replaceTopItems(id, input, currentUser);

    await this.apiRateLimiterService.recordLimits(rateLimitRules);

    return top;
  }

  @Post("tops/:id/fork")
  @UseGuards(JwtAuthGuard)
  async forkTop(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike
  ): Promise<TopDto> {
    const rateLimitRules = createTopWriteRateLimitRules(currentUser.id, request);

    await this.apiRateLimiterService.checkWithinLimits(rateLimitRules);

    const top = await this.topsService.forkTop(id, currentUser);

    await this.apiRateLimiterService.recordLimits(rateLimitRules);

    return top;
  }

  @Get("tops/:id/forks")
  async listTopForks(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Query() query: ListTopsQueryDto
  ): Promise<TopListResponseDto> {
    return this.topsService.listTopForks(id, query.limit ?? 20, query.cursor);
  }

  @Post("tops/:id/like")
  @UseGuards(JwtAuthGuard)
  async toggleTopLike(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike
  ): Promise<TopLikeResponseDto> {
    await this.apiRateLimiterService.assertWithinLimits(
      createTopLikeRateLimitRules(currentUser.id, request)
    );

    return this.topsService.toggleTopLike(id, currentUser);
  }

  @Post("tops/:id/view")
  @UseGuards(OptionalJwtAuthGuard)
  async recordTopView(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Headers("x-opinia-voter") voterHeader: string | undefined,
    @Req() request: RequestLike,
    @CurrentUser() currentUser?: AuthenticatedUser
  ): Promise<TopViewResponseDto> {
    await this.apiRateLimiterService.assertWithinLimits(createTopViewRateLimitRules(request));

    return this.topsService.recordTopView(id, voterHeader, request, currentUser?.id);
  }

  @Get("tops/:id/comments")
  @UseGuards(OptionalJwtAuthGuard)
  async listTopComments(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Query() query: ListTopsQueryDto,
    @CurrentUser() currentUser?: AuthenticatedUser
  ): Promise<TopCommentListResponseDto> {
    return this.topsService.listTopComments(
      id,
      query.limit ?? 20,
      query.cursor,
      currentUser?.id
    );
  }

  @Post("tops/:id/comments")
  @UseGuards(JwtAuthGuard)
  async createTopComment(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() input: CreateTopCommentDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike
  ): Promise<TopCommentDto> {
    await this.apiRateLimiterService.assertWithinLimits(
      createTopCommentWriteRateLimitRules(currentUser.id, request)
    );

    return this.topsService.createTopComment(id, input, currentUser);
  }

  @Get("entities/:entityId/tops")
  async listTopsForEntity(
    @Param("entityId", new ParseUUIDPipe({ version: "4" })) entityId: string
  ): Promise<EntityTopsResponseDto> {
    return this.topsService.listTopsForEntity(entityId);
  }

  @Get("entities/:entityId/system-tops")
  async listSystemTopsForEntity(
    @Param("entityId", new ParseUUIDPipe({ version: "4" })) entityId: string
  ): Promise<EntitySystemTopsResponseDto> {
    return this.systemTopsService.listSystemTopsForEntity(entityId);
  }

  @Get("users/:userId/tops")
  async listTopsByAuthor(
    @Param("userId", new ParseUUIDPipe({ version: "4" })) userId: string,
    @Query() query: ListTopsQueryDto
  ): Promise<TopListResponseDto> {
    return this.topsService.listTopsByAuthor(userId, query.limit ?? 20, query.cursor);
  }
}
