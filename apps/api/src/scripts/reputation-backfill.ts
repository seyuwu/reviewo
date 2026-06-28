import { NestFactory } from "@nestjs/core";

import { AppModule } from "../app.module.js";
import { ReputationReadRepository } from "../modules/reputation/repositories/reputation-read.repository.js";
import { ReputationBackfillService } from "../modules/reputation/services/reputation-backfill.service.js";

const DEFAULT_BATCH_SIZE = 500;

async function main(): Promise<void> {
  const batchSize = Number(process.env.REPUTATION_BACKFILL_BATCH_SIZE ?? DEFAULT_BATCH_SIZE);

  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error("REPUTATION_BACKFILL_BATCH_SIZE must be a positive integer");
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn", "log"]
  });

  try {
    const backfillService = app.get(ReputationBackfillService);
    const readRepository = app.get(ReputationReadRepository);

    let cursor: string | null = null;
    let processedCount = 0;
    let skippedCount = 0;

    for (;;) {
      const ratings = await readRepository.listRatingsForBackfill(cursor, batchSize);

      if (ratings.length === 0) {
        break;
      }

      for (const rating of ratings) {
        const result = await backfillService.processRating(rating);

        if (result === "skipped") {
          skippedCount += 1;
        } else {
          processedCount += 1;
        }
      }

      cursor = ratings.at(-1)?.id ?? null;
      console.log(
        `Reputation backfill progress: processed=${processedCount}, skipped=${skippedCount}, cursor=${cursor}`
      );
    }

    console.log(
      `Reputation backfill completed: processed=${processedCount}, skipped=${skippedCount}`
    );
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
