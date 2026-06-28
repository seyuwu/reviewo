import { NestFactory } from "@nestjs/core";

import { AppModule } from "../app.module.js";
import { ReputationReplayService } from "../modules/reputation/services/reputation-replay.service.js";

async function main(): Promise<void> {
  const calculationVersion = process.env.REPUTATION_REPLAY_CALCULATION_VERSION
    ? Number(process.env.REPUTATION_REPLAY_CALCULATION_VERSION)
    : undefined;

  if (
    calculationVersion !== undefined &&
    (!Number.isInteger(calculationVersion) || calculationVersion < 1)
  ) {
    throw new Error("REPUTATION_REPLAY_CALCULATION_VERSION must be a positive integer");
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn", "log"]
  });

  try {
    const replayService = app.get(ReputationReplayService);
    const result = await replayService.replay({
      ...(calculationVersion !== undefined ? { calculationVersion } : {})
    });

    console.log(`Reputation replay completed: replayedEvents=${result.replayedEvents}`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
