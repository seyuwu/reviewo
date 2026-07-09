import { NestFactory } from "@nestjs/core";

import { AppModule } from "../app.module.js";
import { SystemTopsService } from "../modules/tops/services/system-tops.service.js";

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn", "log"]
  });

  try {
    const systemTopsService = app.get(SystemTopsService);
    const result = await systemTopsService.refreshAll();

    console.log(`System tops refresh completed: refreshed=${result.refreshed}`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
