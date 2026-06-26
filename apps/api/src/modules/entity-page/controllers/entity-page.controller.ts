import { Controller, Get, Param, ParseUUIDPipe } from "@nestjs/common";

import { EntityPageResponseDto } from "../dto/entity-page-response.dto.js";
import { EntityPageService } from "../services/entity-page.service.js";

@Controller("entities")
export class EntityPageController {
  constructor(private readonly entityPageService: EntityPageService) {}

  @Get(":entityId/page")
  async getEntityPage(
    @Param("entityId", new ParseUUIDPipe({ version: "4" })) entityId: string
  ): Promise<EntityPageResponseDto> {
    return this.entityPageService.getEntityPage(entityId);
  }
}
