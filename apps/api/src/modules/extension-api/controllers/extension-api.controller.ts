import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Query, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard.js";
import { RateEntityDto } from "../../ratings/dto/rate-entity.dto.js";
import { ExtensionQuickRatingResponseDto } from "../dto/extension-quick-rating-response.dto.js";
import { ExtensionResolveQueryDto } from "../dto/extension-resolve-query.dto.js";
import { ExtensionResolveResponseDto } from "../dto/extension-resolve-response.dto.js";
import { ExtensionApiService } from "../services/extension-api.service.js";

@Controller("extension")
export class ExtensionApiController {
  constructor(private readonly extensionApiService: ExtensionApiService) {}

  @Get("resolve")
  async resolveUrl(@Query() query: ExtensionResolveQueryDto): Promise<ExtensionResolveResponseDto> {
    return this.extensionApiService.resolveUrl(query.url);
  }

  @Put("entities/:entityId/my-rating")
  @UseGuards(JwtAuthGuard)
  async rateEntity(
    @Param("entityId", new ParseUUIDPipe({ version: "4" })) entityId: string,
    @Body() input: RateEntityDto,
    @CurrentUser() currentUser: AuthenticatedUser
  ): Promise<ExtensionQuickRatingResponseDto> {
    return this.extensionApiService.rateEntity(entityId, input, currentUser);
  }
}
