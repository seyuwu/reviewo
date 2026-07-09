import { Injectable } from "@nestjs/common";
import { EntityMediaSource, type Prisma } from "#prisma/client";

import { assertSafeHttpUrl } from "../../../common/validation/assert-safe-http-url.js";
import { EntitiesRepository } from "../repositories/entities.repository.js";
import { EntityMediaRepository } from "../repositories/entity-media.repository.js";
import {
  ENTITY_MEDIA_MANUAL_SOURCES,
  ENTITY_MEDIA_TRUST_SCORES
} from "../constants/entity-media.js";

@Injectable()
export class EntityMediaService {
  constructor(
    private readonly entityMediaRepository: EntityMediaRepository,
    private readonly entitiesRepository: EntitiesRepository
  ) {}

  async setManualLogo(
    entityId: string,
    url: string | null,
    source: Extract<EntityMediaSource, "MANUAL" | "CONTRIBUTION">
  ): Promise<void> {
    if (!url?.trim()) {
      await this.entityMediaRepository.deleteLogoBySources(entityId, [source]);
      await this.syncLogoUrlCache(entityId);
      return;
    }

    const safeUrl = assertSafeHttpUrl(url);

    await this.entityMediaRepository.upsertLogo({
      entityId,
      source,
      trustScore: ENTITY_MEDIA_TRUST_SCORES[source],
      url: safeUrl
    });
    await this.syncLogoUrlCache(entityId);
  }

  async clearManualLogos(entityId: string): Promise<void> {
    await this.entityMediaRepository.deleteManualLogos(entityId);
    await this.syncLogoUrlCache(entityId);
  }

  async upsertAutoLogo(
    entityId: string,
    source: Extract<EntityMediaSource, "FAVICON" | "OG_IMAGE">,
    url: string
  ): Promise<void> {
    const safeUrl = assertSafeHttpUrl(url);

    await this.entityMediaRepository.upsertLogo({
      entityId,
      source,
      trustScore: ENTITY_MEDIA_TRUST_SCORES[source],
      url: safeUrl
    });
  }

  async deleteAutoLogos(entityId: string): Promise<void> {
    await this.entityMediaRepository.deleteAutoLogos(entityId);
  }

  async resolvePrimaryLogoUrl(entityId: string): Promise<string | null> {
    const media = await this.entityMediaRepository.findPrimaryLogo(entityId);

    return media?.url ?? null;
  }

  async syncLogoUrlCache(entityId: string): Promise<string | null> {
    const logoUrl = await this.resolvePrimaryLogoUrl(entityId);

    await this.entitiesRepository.updateLogoUrl(entityId, logoUrl);

    return logoUrl;
  }

  async hasHighTrustLogo(entityId: string): Promise<boolean> {
    return this.entityMediaRepository.hasHighTrustLogo(entityId, 1);
  }

  async moveMediaOnEntityMerge(
    transaction: Prisma.TransactionClient,
    sourceEntityId: string,
    targetEntityId: string
  ): Promise<void> {
    await this.entityMediaRepository.moveMediaToEntity(transaction, sourceEntityId, targetEntityId);
  }

  getManualSources(): readonly EntityMediaSource[] {
    return ENTITY_MEDIA_MANUAL_SOURCES;
  }
}
