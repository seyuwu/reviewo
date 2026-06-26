import { Controller, Get, Param, ParseUUIDPipe } from "@nestjs/common";

import { TrustConfidenceDto } from "../dto/trust-confidence.dto.js";
import { TrustService } from "../services/trust.service.js";

@Controller("trust")
export class TrustController {
  constructor(private readonly trustService: TrustService) {}

  @Get("entities/:entityId")
  async getEntityTrust(
    @Param("entityId", new ParseUUIDPipe({ version: "4" })) entityId: string
  ): Promise<TrustConfidenceDto> {
    return this.trustService.getEntityTrust(entityId);
  }
}
