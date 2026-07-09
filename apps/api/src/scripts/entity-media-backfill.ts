import { NestFactory } from "@nestjs/core";

import { AppModule } from "../app.module.js";
import { ENTITY_MEDIA_BACKFILL_BATCH_SIZE } from "../modules/entities/constants/entity-media.js";
import { EntityMediaBackfillService } from "../modules/entities/services/entity-media-backfill.service.js";

async function main(): Promise<void> {
  const batchSize = Number(process.env.ENTITY_MEDIA_BACKFILL_BATCH_SIZE ?? ENTITY_MEDIA_BACKFILL_BATCH_SIZE);

  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error("ENTITY_MEDIA_BACKFILL_BATCH_SIZE must be a positive integer");
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn", "log"]
  });

  try {
    const backfillService = app.get(EntityMediaBackfillService);

    let cursor: string | null = null;
    let processedCount = 0;

    for (;;) {
      const result = await backfillService.enrichBatch(cursor, batchSize);

      if (result.processedCount === 0) {
        break;
      }

      processedCount += result.processedCount;
      cursor = result.cursor;
      console.log(`Entity media backfill progress: processed=${processedCount}, cursor=${cursor}`);
    }

    console.log(`Entity media backfill complete: processed=${processedCount}`);
  } finally {
    await app.close();
  }
}

await main();
