import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
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
import { createEntityCreationRateLimitRules } from "../../../common/rate-limiting/write-rate-limit-rules.js";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard.js";
import { CreateEntityDto } from "../dto/create-entity.dto.js";
import { EntityDto } from "../dto/entity.dto.js";
import { SearchEntitiesDto } from "../dto/search-entities.dto.js";
import { EntitiesService } from "../services/entities.service.js";

@Controller("entities")
export class EntitiesController {
  constructor(
    private readonly apiRateLimiterService: ApiRateLimiterService,
    private readonly entitiesService: EntitiesService
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async createEntity(
    @Body() input: CreateEntityDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike
  ): Promise<EntityDto> {
    await this.apiRateLimiterService.assertWithinLimits(
      createEntityCreationRateLimitRules(currentUser.id, request)
    );

    return this.entitiesService.createEntity(input, currentUser);
  }

  @Get("search")
  async searchEntities(@Query() query: SearchEntitiesDto): Promise<EntityDto[]> {
    return this.entitiesService.searchEntities(query.query);
  }

  @Get(":id")
  async getEntityById(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string
  ): Promise<EntityDto> {
    return this.entitiesService.getEntityById(id);
  }
}
