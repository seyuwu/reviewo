import { EntityMediaSource, EntityMediaType } from "#prisma/client";

export const ENTITY_MEDIA_TRUST_SCORES: Record<EntityMediaSource, number> = {
  [EntityMediaSource.MANUAL]: 1,
  [EntityMediaSource.CONTRIBUTION]: 1,
  [EntityMediaSource.MIGRATION]: 1,
  [EntityMediaSource.FAVICON]: 0.7,
  [EntityMediaSource.OG_IMAGE]: 0.5
};

export const ENTITY_MEDIA_MANUAL_TRUST_THRESHOLD = 1;

export const ENTITY_MEDIA_ENRICHMENT_CONCURRENCY = 5;

export const ENTITY_MEDIA_BACKFILL_BATCH_SIZE = 100;

export const ENTITY_MEDIA_BACKFILL_DELAY_MS = 250;

export const ENTITY_MEDIA_AUTO_SOURCES = [
  EntityMediaSource.FAVICON,
  EntityMediaSource.OG_IMAGE
] as const;

export const ENTITY_MEDIA_MANUAL_SOURCES = [
  EntityMediaSource.MANUAL,
  EntityMediaSource.CONTRIBUTION
] as const;
