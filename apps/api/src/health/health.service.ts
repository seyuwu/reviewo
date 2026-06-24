import { Injectable, ServiceUnavailableException } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service.js";

export interface HealthResponse {
  checks: {
    database: "ok";
  };
  status: "ok";
}

@Injectable()
export class HealthService {
  constructor(private readonly prismaService: PrismaService) {}

  async check(): Promise<HealthResponse> {
    try {
      await this.prismaService.isHealthy();
    } catch {
      throw new ServiceUnavailableException("Database health check failed");
    }

    return {
      checks: {
        database: "ok"
      },
      status: "ok"
    };
  }
}
