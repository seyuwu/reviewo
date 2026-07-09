import { Injectable } from "@nestjs/common";

import { ENTITY_MEDIA_BACKFILL_DELAY_MS } from "../constants/entity-media.js";
import { EntityMediaBackfillRepository } from "../repositories/entity-media-backfill.repository.js";
import { EntityMediaEnrichmentService } from "./entity-media-enrichment.service.js";

@Injectable()
export class EntityMediaBackfillService {
  constructor(
    private readonly entityMediaBackfillRepository: EntityMediaBackfillRepository,
    private readonly entityMediaEnrichmentService: EntityMediaEnrichmentService
  ) {}

  async enrichBatch(cursor: string | null, batchSize: number): Promise<{
    cursor: string | null;
    processedCount: number;
  }> {
    const entities = await this.entityMediaBackfillRepository.listEntitiesForLogoEnrichment(
      cursor,
      batchSize
    );

    if (entities.length === 0) {
      return {
        cursor: null,
        processedCount: 0
      };
    }

    for (const entity of entities) {
      await this.entityMediaEnrichmentService.enrichEntityLogo(entity.id);
      await delay(ENTITY_MEDIA_BACKFILL_DELAY_MS);
    }

    return {
      cursor: entities.at(-1)?.id ?? null,
      processedCount: entities.length
    };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
