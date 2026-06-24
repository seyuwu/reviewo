import { Controller, Get } from "@nestjs/common";

import { HealthService } from "./health.service.js";
import type { HealthResponse } from "./health.service.js";

@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  async check(): Promise<HealthResponse> {
    return this.healthService.check();
  }
}
