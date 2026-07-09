import { Injectable, Logger } from "@nestjs/common";
import { EntityMediaSource } from "#prisma/client";

import { EntitiesRepository } from "../repositories/entities.repository.js";
import { ENTITY_MEDIA_ENRICHMENT_CONCURRENCY } from "../constants/entity-media.js";
import { EntityMediaService } from "./entity-media.service.js";
import { SiteMetadataFetcherService } from "./site-metadata-fetcher.service.js";

@Injectable()
export class EntityMediaEnrichmentService {
  private readonly logger = new Logger(EntityMediaEnrichmentService.name);
  private readonly inFlightEntityIds = new Set<string>();
  private activeCount = 0;
  private readonly waitQueue: Array<() => void> = [];

  constructor(
    private readonly entitiesRepository: EntitiesRepository,
    private readonly entityMediaService: EntityMediaService,
    private readonly siteMetadataFetcherService: SiteMetadataFetcherService
  ) {}

  scheduleEnrichment(entityId: string): void {
    if (this.inFlightEntityIds.has(entityId)) {
      return;
    }

    this.inFlightEntityIds.add(entityId);

    void this.runWithConcurrencyLimit(async () => {
      try {
        await this.enrichEntityLogo(entityId);
      } catch (error) {
        this.logger.warn(
          `Entity media enrichment failed for ${entityId}`,
          error instanceof Error ? error.message : error
        );
      } finally {
        this.inFlightEntityIds.delete(entityId);
      }
    });
  }

  async enrichEntityLogo(entityId: string): Promise<void> {
    const entity = await this.entitiesRepository.findById(entityId);

    if (!entity?.canonicalUrl) {
      return;
    }

    if (await this.entityMediaService.hasHighTrustLogo(entityId)) {
      return;
    }

    const metadata = await this.siteMetadataFetcherService.fetchMetadata(entity.canonicalUrl);

    if (metadata.faviconUrl) {
      await this.entityMediaService.upsertAutoLogo(
        entityId,
        EntityMediaSource.FAVICON,
        metadata.faviconUrl
      );
    }

    if (metadata.ogImageUrl) {
      await this.entityMediaService.upsertAutoLogo(
        entityId,
        EntityMediaSource.OG_IMAGE,
        metadata.ogImageUrl
      );
    }

    await this.entityMediaService.syncLogoUrlCache(entityId);
  }

  async refreshAfterCanonicalUrlChange(entityId: string): Promise<void> {
    await this.entityMediaService.deleteAutoLogos(entityId);
    await this.entityMediaService.syncLogoUrlCache(entityId);
    this.scheduleEnrichment(entityId);
  }

  private async runWithConcurrencyLimit(task: () => Promise<void>): Promise<void> {
    if (this.activeCount >= ENTITY_MEDIA_ENRICHMENT_CONCURRENCY) {
      await new Promise<void>((resolve) => {
        this.waitQueue.push(resolve);
      });
    }

    this.activeCount += 1;

    try {
      await task();
    } finally {
      this.activeCount -= 1;
      const next = this.waitQueue.shift();

      if (next) {
        next();
      }
    }
  }
}
