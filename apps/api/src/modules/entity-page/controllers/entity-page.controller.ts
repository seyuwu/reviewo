import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import { OptionalJwtAuthGuard } from "../../auth/guards/optional-jwt-auth.guard.js";
import { EntityPageResponseDto } from "../dto/entity-page-response.dto.js";
import { EntityPageService } from "../services/entity-page.service.js";

@Controller("entities")
export class EntityPageController {
  constructor(private readonly entityPageService: EntityPageService) {}

  @Get(":entityId/page")
  @UseGuards(OptionalJwtAuthGuard)
  async getEntityPage(
    @Param("entityId", new ParseUUIDPipe({ version: "4" })) entityId: string,
    @CurrentUser() currentUser?: AuthenticatedUser
  ): Promise<EntityPageResponseDto> {
    return this.entityPageService.getEntityPage(entityId, currentUser?.id);
  }
}
