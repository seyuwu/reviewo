import { Injectable, Logger, OnModuleInit } from "@nestjs/common";

import { SystemTopsService } from "./system-tops.service.js";

@Injectable()
export class SystemTopsStartupRefreshService implements OnModuleInit {
  private readonly logger = new Logger(SystemTopsStartupRefreshService.name);

  constructor(private readonly systemTopsService: SystemTopsService) {}

  onModuleInit(): void {
    if (process.env.SYSTEM_TOPS_REFRESH_ON_STARTUP !== "true") {
      return;
    }

    void this.systemTopsService
      .refreshAll()
      .then((result) => {
        this.logger.log(`System tops startup refresh completed: refreshed=${result.refreshed}`);
      })
      .catch((error: unknown) => {
        this.logger.warn(
          `System tops startup refresh failed: ${error instanceof Error ? error.message : String(error)}`
        );
      });
  }
}
